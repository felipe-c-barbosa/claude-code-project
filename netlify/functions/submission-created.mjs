const ACCEPTED_FORMS = new Set(["hero-signup", "cta-signup"]);
const RESEND_CONTACTS_URL = "https://api.resend.com/contacts";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(fullName) {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function looksLikeDuplicateContact(status, body) {
  if (![400, 409, 422].includes(status)) return false;
  return /already exists|duplicate|exists/i.test(body);
}

async function createResendContact(payload, apiKey, idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "felipebarbosa-netlify/1.0",
  };

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  return fetch(RESEND_CONTACTS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

export default async function handler(request) {
  const apiKey = process.env.RESEND_API_KEY;
  const segmentId = process.env.RESEND_SEGMENT_ID;

  if (!apiKey) {
    console.error("Missing RESEND_API_KEY");
    return new Response("Missing Resend API key", { status: 500 });
  }

  try {
    const event = await request.json();
    const submission = event.payload || {};
    const data = submission.data || {};
    const formName = clean(submission.form_name || data["form-name"]);

    if (!ACCEPTED_FORMS.has(formName)) {
      console.info("Ignoring form submission", { formName });
      return new Response("Ignored form", { status: 200 });
    }

    const email = clean(data.email || submission.email).toLowerCase();
    const name = clean(data.name || submission.name);

    if (!email) {
      console.warn("Submission without email", {
        formName,
        submissionId: submission.id,
      });

      return new Response("Missing email", { status: 200 });
    }

    const { firstName, lastName } = splitName(name);
    const resendPayload = {
      email,
      unsubscribed: false,
    };

    if (firstName) resendPayload.first_name = firstName;
    if (lastName) resendPayload.last_name = lastName;

    if (segmentId) {
      resendPayload.segments = [{ id: segmentId }];
    }

    const resendResponse = await createResendContact(
      resendPayload,
      apiKey,
      submission.id
    );
    const responseBody = await resendResponse.text();

    if (!resendResponse.ok) {
      if (looksLikeDuplicateContact(resendResponse.status, responseBody)) {
        console.info("Contact already exists in Resend", {
          email,
          formName,
        });

        return new Response("Contact already exists", { status: 200 });
      }

      console.error("Resend contact create failed", {
        status: resendResponse.status,
        body: responseBody,
      });

      return new Response("Resend failed", { status: 502 });
    }

    console.info("Contact sent to Resend", {
      email,
      formName,
      submissionId: submission.id,
    });

    return new Response("Contact sent to Resend", { status: 200 });
  } catch (error) {
    console.error("submission-created failed", error);
    return new Response("Internal error", { status: 500 });
  }
}

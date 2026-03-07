const FEED_URL = 'https://www.felipebarbosa.me/feed.xml';

exports.handler = async () => {
  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) {
      return { statusCode: 502, body: 'Failed to fetch feed' };
    }
    const xml = await response.text();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
      body: xml,
    };
  } catch (err) {
    return { statusCode: 500, body: 'Error fetching feed' };
  }
};

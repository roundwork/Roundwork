// Verifies a Gumroad license key server-side, so the app's own
// front-end JavaScript never has to call Gumroad directly (which
// Gumroad blocks from browsers via CORS).
//
// Setup required before this works:
// 1. In Gumroad, create your product with "Generate a unique license
//    key per sale" turned on, and note its permalink (the short code
//    in the product's URL).
// 2. In your Netlify site: Site settings -> Environment variables,
//    add GUMROAD_PRODUCT_PERMALINK = that permalink.
// 3. Deploy this file at netlify/functions/verify-license.js
//    (Netlify auto-detects and deploys anything in that folder).

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ valid: false, message: 'Method not allowed' })
    };
  }

  let licenseKey;
  try {
    const body = JSON.parse(event.body || '{}');
    licenseKey = (body.licenseKey || '').trim();
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ valid: false, message: 'Invalid request body' })
    };
  }

  if (!licenseKey) {
    return {
      statusCode: 400,
      body: JSON.stringify({ valid: false, message: 'A license key is required.' })
    };
  }

  const PRODUCT_PERMALINK = process.env.GUMROAD_PRODUCT_PERMALINK;
  if (!PRODUCT_PERMALINK) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        valid: false,
        message: 'Server is missing GUMROAD_PRODUCT_PERMALINK. Set it in Netlify environment variables.'
      })
    };
  }

  try {
    const params = new URLSearchParams();
    params.append('product_permalink', PRODUCT_PERMALINK);
    params.append('license_key', licenseKey);
    // Set to 'true' if you want Gumroad to count/limit how many times
    // this key has been checked (useful for capping device activations).
    params.append('increment_uses_count', 'false');

    const resp = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await resp.json();

    if (data && data.success) {
      // Optional extra checks you may want to add later:
      // - data.purchase.refunded / data.purchase.chargebacked -> treat as invalid
      // - data.purchase.subscription_cancelled_at -> treat as invalid for subscriptions
      return { statusCode: 200, body: JSON.stringify({ valid: true }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ valid: false, message: (data && data.message) || 'License key not recognized.' })
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ valid: false, message: 'Could not reach the license verification service. Please try again shortly.' })
    };
  }
};

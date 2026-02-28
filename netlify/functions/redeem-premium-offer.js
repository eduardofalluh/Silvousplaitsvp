const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async () => {
  return {
    statusCode: 410,
    headers,
    body: JSON.stringify({
      error: 'Deprecated endpoint. Use request-premium-otp and verify-premium-otp.',
    }),
  };
};

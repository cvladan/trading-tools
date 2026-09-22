export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== 'https://trading.cvladan.com') return Response.redirect(`https://trading.cvladan.com${url.pathname}${url.search}`, 301);
    const response = await env.ASSETS.fetch(request);
    return response.status === 307 ? new Response(response.body, { status: 308, headers: response.headers }) : response;
  }
};

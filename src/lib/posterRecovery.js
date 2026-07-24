export async function replayStoredPosterRecovery({
  recovery,
  rebuildPreview,
  handoffPreview,
  clearRecovery,
  discardPreview = () => {},
}) {
  const action = recovery?.action === "poster_share"
    ? "share"
    : recovery?.action === "poster_save"
      ? "save"
      : "";
  const context = recovery?.context;
  if (!action || !context?.posterType || !context?.stateVersion) {
    clearRecovery?.();
    return { status: "invalid" };
  }

  let preview = null;
  try {
    preview = await rebuildPreview(context);
  } catch {
    clearRecovery?.();
    return { status: "failed" };
  }
  if (!preview?.blob || preview.stateVersion !== context.stateVersion) {
    discardPreview(preview);
    clearRecovery?.();
    return { status: "stale" };
  }

  const handoffStatus = await handoffPreview(action, preview);
  return { status: handoffStatus };
}

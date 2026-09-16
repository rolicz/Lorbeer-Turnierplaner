import { useConnectionTrouble } from "./useConnectionTrouble";

/**
 * Realtime **trouble** indicator, labelled (T10).
 *
 * The happy path says nothing: a working connection is the normal state, and
 * announcing it next to the bell put a third "live" marker on a screen that
 * already has the bottom bar's pulsing dot and the page's own content. This
 * renders only while the socket is reconnecting or offline — the one thing the
 * reader cannot see anywhere else. *When* it says so lives in
 * `useConnectionTrouble` (grace in, settle out).
 *
 * This is the **desktop sidebar's** rendering, where a line of text costs
 * nothing. The mobile top bar says the same thing as one 40px marker in the
 * slot the bell otherwise owns (`TopBarStatus`, Q13): there the width of a word
 * would shove a centred title, which is the whole reason that bar has fixed
 * side boxes.
 */
export default function ConnectionIndicator() {
  const trouble = useConnectionTrouble();
  if (!trouble) return null;

  const offline = trouble === "offline";
  const label = offline ? "Offline" : "Reconnecting";

  // A dropped socket is not a drawn match: the amber here is the `warn` state token,
  // never `draw` (A8). Offline stays the quieter of the two on purpose — red would put
  // a second red dot in the chrome that already carries the live one.
  return (
    <span
      data-connection-status={trouble}
      className={`inline-flex items-center gap-1.5 text-xs ${offline ? "text-text-muted" : "text-warn"}`}
      title={`Realtime: ${label}`}
      aria-label={`Realtime status: ${label}`}
    >
      <span
        className={`inline-flex h-2 w-2 shrink-0 rounded-full ${offline ? "bg-status-bar-default" : "bg-warn"}`}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

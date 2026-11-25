import type { PreServiceCheck } from '../../src/shared/snapshot.ts';

// A connection target's pre-service check against the set, as the producer's row and the setup
// screen both show it: not checked, the target's pass text, or what does not check out, as
// the target words it. That is first what keeps the target from checking its file or is otherwise
// wrong with it that is not a failed match, such as no playlist picked or a cue that never fires,
// under "Problems:", then the names the target cannot match in its file under "Cannot match:". The
// problems come first so that none of them reads as under "Cannot match:". Either way its notes come
// last, under "Notes:", in grey: expected behaviour the producer need not fix, such as a section with
// no group of its name that shows slide 1. Each heading shows only when it has lines. A device check
// shows what the target found, then what is wrong with it with no heading, and no song or section
// line.
export function CheckResult({ check }: { check: PreServiceCheck }) {
  return (
    <div className={`check ${check.kind}`}>
      {check.kind === 'not-checked' && <p className="check-status">Not checked.</p>}
      {check.kind === 'matched' && (
        <>
          <p className="check-status">{check.passText}</p>
          <CheckNotes notes={check.notes} />
        </>
      )}
      {check.kind === 'unmatched' && (
        <>
          {check.problems.length > 0 && <p className="check-status">Problems:</p>}
          <Problems problems={check.problems} />
          {check.names.length > 0 && (
            <>
              <p className="check-status">Cannot match:</p>
              <ul className="check-unmatched">
                {check.names.map((name, index) => (
                  <li key={index} className="check-unmatched-name">
                    {name}
                  </li>
                ))}
              </ul>
            </>
          )}
          <CheckNotes notes={check.notes} />
        </>
      )}
      {check.kind === 'device' && (
        <>
          {check.notes.map((note, index) => (
            <p key={index} className="check-status check-note">
              {note}
            </p>
          ))}
          <Problems problems={check.problems} />
        </>
      )}
    </div>
  );
}

// A file check's notes under "Notes:", and nothing when it has none. The heading is not a
// check-status line, which takes the check's green or warning colour.
function CheckNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <>
      <p className="check-notes-heading">Notes:</p>
      <ul className="check-notes">
        {notes.map((note, index) => (
          <li key={index} className="check-note">
            {note}
          </li>
        ))}
      </ul>
    </>
  );
}

// A check's problem lines, in the warning colour, or nothing when there are none. A file check puts
// them under "Problems:"; a device check shows them with no heading.
function Problems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="check-problems">
      {problems.map((problem, index) => (
        <li key={index} className="check-problem">
          {problem}
        </li>
      ))}
    </ul>
  );
}

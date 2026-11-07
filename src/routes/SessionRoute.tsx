import { useNavigate, useParams } from 'react-router-dom';
import { SessionView } from '@/components/SessionView';
import { LoadingCards } from '@/components/LoadingCards';
import { MissingRow } from '@/components/MissingRow';
import { useExercise } from '@/hooks/useExercise';

// The session screen for one exercise, addressed as `/exercises/<id>`.
//
// `SessionView` still takes the row as a prop, so the screen itself is untouched by the
// routing: what changed is where the row comes from. It used to be the object the
// dashboard row or the card had just been holding; now the route reads it by the id the
// address carries, which is the only thing left after a reload or a pasted link.
//
// The two states before the screen are not decorative: the read is a round trip, and a
// row that is not there is a real answer (deleted, mistyped, or another account's, which
// RLS hides). Both are drawn here rather than inside the screen, which has no reason to
// know an address exists.
//
// Back goes to the list by path, not by history entry. Entering through a pasted link
// leaves no previous entry to return to, and `history.back()` from there lands wherever
// the reader came from before opening the app - while the button's own label says
// "back to exercises", which is the promise the path keeps.
export default function SessionRoute() {
  const { exerciseId } = useParams();
  const navigate = useNavigate();
  const { exercise, loading } = useExercise(exerciseId);

  if (loading) return <LoadingCards />;
  if (!exercise) {
    return <MissingRow missingKey="missing_exercise" backKey="back_to_exercises" backTo="/exercises" />;
  }
  return <SessionView exercise={exercise} onBack={() => navigate('/exercises')} />;
}

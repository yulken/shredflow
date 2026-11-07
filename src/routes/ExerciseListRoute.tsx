import { useNavigate } from 'react-router-dom';
import { ExerciseList } from '@/components/ExerciseList';

// The catalog at `/exercises`, addressed rather than selected. Opening a card used to
// set a `selectedExercise` object in `App.tsx` while the address stayed `/exercises`;
// the card now writes the row's own id into the URL. Coming back remounts the list, and
// the order the cards were in is the one `useListOrder` reads out of `localStorage`, so
// the list returns as the reader left it - the same persistence that made it survive
// the state-based view's unmounts.
export default function ExerciseListRoute() {
  const navigate = useNavigate();
  return <ExerciseList onSelectExercise={(exercise) => navigate(`/exercises/${exercise.id}`)} />;
}

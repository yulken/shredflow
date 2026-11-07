import { useNavigate } from 'react-router-dom';
import { Dashboard } from '@/components/Dashboard';

// The dashboard at `/`. The catalog row still hands the whole row up - the screen does
// not know about routes - and the address for that row is built here: `/exercises/<id>`
// is the same exercise the row opens, and it is what a reload and a shared link answer
// against.
export default function DashboardRoute() {
  const navigate = useNavigate();
  return <Dashboard onSelectExercise={(exercise) => navigate(`/exercises/${exercise.id}`)} />;
}

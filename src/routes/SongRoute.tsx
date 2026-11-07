import { useNavigate, useParams } from 'react-router-dom';
import { SongView } from '@/components/SongView';
import { LoadingCards } from '@/components/LoadingCards';
import { MissingRow } from '@/components/MissingRow';
import { useSong } from '@/hooks/useSong';

// The song screen for one song, addressed as `/songs/<id>`, the exercise screen's
// structure with the song's tables underneath it.
//
// The row arrives by id for the same reason, and the same three ways to miss it are one
// card. `SongView` keeps taking the row as a prop - the routing stops at this wrapper,
// and the percent stays the stored column the triggers write, read back through the
// screen's own refresh rather than derived here from the address.
export default function SongRoute() {
  const { songId } = useParams();
  const navigate = useNavigate();
  const { song, loading } = useSong(songId);

  if (loading) return <LoadingCards />;
  if (!song) {
    return <MissingRow missingKey="missing_song" backKey="back_to_songs" backTo="/songs" />;
  }
  return <SongView song={song} onBack={() => navigate('/songs')} />;
}

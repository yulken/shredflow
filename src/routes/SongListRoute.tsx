import { useNavigate } from 'react-router-dom';
import { SongList } from '@/components/SongList';

// The song catalog at `/songs`. A row's tap writes the song's id into the address
// instead of holding the row in a `selectedSong` object next to the tab it came from,
// which is what lets the song screen answer a reload.
export default function SongListRoute() {
  const navigate = useNavigate();
  return <SongList onSelectSong={(song) => navigate(`/songs/${song.id}`)} />;
}

// The three shapes the app shows before a screen has data: the auth session resolving,
// a lazily loaded route chunk arriving, and a detail route reading the row its URL
// names. All three are the same three cards, so all three say the same thing - the
// shape `App.tsx` drew by hand for the gate, lifted out so the gate and the routes
// cannot drift into two different skeletons.
export function LoadingCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card h-44 animate-pulse">
          <div className="h-full bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

export default function GuestLoading() {
  return (
    <div className="flex h-full items-center justify-center px-4 py-12">
      <div
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-2 border-guest-ink-muted/30 border-t-guest-accent"
      />
    </div>
  );
}

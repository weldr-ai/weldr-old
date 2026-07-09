export function Placeholder() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center space-y-2 text-center">
      <h3 className="text-lg font-semibold">Empty Canvas</h3>
      <p className="text-muted-foreground">Get started by chatting with Weldr below.</p>
    </div>
  );
}

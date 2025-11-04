import { UserContext } from "./utils";

export default function UserContextViewer({
  context,
  loading,
}: {
  context: UserContext | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border p-4 bg-card shadow-sm">
      <h2 className="text-lg font-semibold mb-2">User Context</h2>
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : context ? (
        <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
          {JSON.stringify(context, null, 2)}
        </pre>
      ) : (
        <div className="text-muted-foreground text-sm">No context found</div>
      )}
    </div>
  );
}
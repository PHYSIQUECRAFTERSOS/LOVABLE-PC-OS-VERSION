interface SupplementReviewProps {
  extracted: any;
}

const SupplementReview = ({ extracted }: SupplementReviewProps) => {
  const supplements = extracted.supplements || [];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Supplement Stack</h3>
      {supplements.length === 0 ? (
        <p className="text-xs text-muted-foreground">No supplements extracted.</p>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Dose</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Timing</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody>
              {supplements.map((supp: any, idx: number) => (
                <tr key={idx} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 text-foreground font-medium">{supp.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{supp.dose || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{supp.timing || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{supp.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SupplementReview;

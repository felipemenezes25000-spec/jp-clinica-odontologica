// ARQUIVO TEMPORARIO — apagar depois da conferencia visual.
import { createFileRoute } from "@tanstack/react-router";

import { TeamSection } from "@/components/site/TeamSection";

export const Route = createFileRoute("/previa-equipe")({
  component: () => <TeamSection />,
});

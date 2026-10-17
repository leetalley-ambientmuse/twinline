import { createFileRoute } from "@tanstack/react-router";
import { TwinlineApp } from "@/components/TwinlineApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <TwinlineApp />;
}

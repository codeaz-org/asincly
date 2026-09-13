import { MarkLoader } from "@/components/brand/loader";

export default function Loading() {
  return (
    <div className="min-h-[60dvh] grid place-items-center">
      <MarkLoader size="md" label="Catching up" />
    </div>
  );
}

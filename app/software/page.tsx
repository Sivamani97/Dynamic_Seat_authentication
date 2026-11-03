import { Metadata } from "next";
import { SoftwareComponentsHub } from "@/components/software/SoftwareComponentsHub";

export const metadata: Metadata = {
  title: "Software Components Hub | SmartSeat Architecture",
  description: "Modular software components: Dynamic QR Generation, Mobile QR Validation, and Emergency SOS Response.",
};

export default function SoftwarePage() {
  return (
    <div className="min-h-screen py-6 px-4">
      <SoftwareComponentsHub />
    </div>
  );
}


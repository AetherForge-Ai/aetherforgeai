import { redirect } from "next/navigation";

// Profile management now lives in the app settings.
export default function ProfileRedirectPage() {
  redirect("/settings");
}

import { redirect } from "next/navigation";

/** The dashboard opens on the Printout orders */
export default function AdminHome() {
  redirect("/admin/print");
}

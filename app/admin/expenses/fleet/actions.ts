"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { isValidMobile, normalizeMobile, requireUser } from "@/lib/auth";
import {
  createDriver,
  createVehicle,
  deleteUnused,
  getDriver,
  getVehicle,
  renameVehicle,
  setActive,
  updateDriver,
} from "@/lib/expenses/fleet";
import { withFlash } from "../../filters";

const BACK = "/admin/expenses/fleet";
const name = (fd: FormData) => String(fd.get("name") ?? "").replace(/\s+/g, " ").trim();
const who = (d: { name: string; phone: string }) => `${d.name} (${d.phone})`;

function done(flash: string, detail?: string): never {
  revalidatePath("/admin/expenses", "layout");
  redirect(withFlash(BACK, flash, detail));
}

// ---------- Vehicles ----------

export async function addVehicle(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const vehicle = name(fd);
  if (vehicle.length < 2 || vehicle.length > 60) redirect(withFlash(BACK, "vehicle-name"));
  const saved = await createVehicle(vehicle, user.name);
  if (saved === "exists") redirect(withFlash(BACK, "vehicle-exists", vehicle));
  await logActivity(user, "vehicle.created", vehicle, "Car");
  done("vehicle-added", vehicle);
}

export async function editVehicle(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const before = await getVehicle(Number(fd.get("id")));
  if (!before) redirect(withFlash(BACK, "not-found"));
  const vehicle = name(fd);
  if (vehicle.length < 2 || vehicle.length > 60) redirect(withFlash(BACK, "vehicle-name"));
  if (vehicle === before.name) done("trip-unchanged", vehicle);
  const saved = await renameVehicle(before.id, vehicle, user.name);
  if (saved === "exists") redirect(withFlash(BACK, "vehicle-exists", vehicle));
  if (saved === "missing") redirect(withFlash(BACK, "not-found"));
  await logActivity(user, "vehicle.renamed", vehicle, `Was called ${before.name}`);
  done("vehicle-renamed", vehicle);
}

/** Delete when nothing refers to it yet; otherwise switch it off or back on */
export async function vehicleStatus(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const vehicle = await getVehicle(Number(fd.get("id")));
  if (!vehicle) redirect(withFlash(BACK, "not-found"));
  const action = String(fd.get("action"));

  if (action === "delete") {
    if (!(await deleteUnused("vehicles", vehicle.id))) redirect(withFlash(BACK, "vehicle-in-use", vehicle.name));
    await logActivity(user, "vehicle.deleted", vehicle.name);
    done("vehicle-deleted", vehicle.name);
  }
  const active = action === "activate";
  if (!(await setActive("vehicles", vehicle.id, active, user.name))) redirect(withFlash(BACK, "not-found"));
  await logActivity(user, active ? "vehicle.reactivated" : "vehicle.deactivated", vehicle.name);
  done(active ? "vehicle-on" : "vehicle-off", vehicle.name);
}

// ---------- Drivers ----------

function readDriver(fd: FormData): { name: string; phone: string } | "name" | "phone" {
  const driver = name(fd);
  const phone = normalizeMobile(String(fd.get("phone") ?? ""));
  if (driver.length < 2 || driver.length > 60) return "name";
  if (!isValidMobile(phone)) return "phone";
  return { name: driver, phone };
}

export async function addDriver(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const driver = readDriver(fd);
  if (driver === "name") redirect(withFlash(BACK, "driver-name"));
  if (driver === "phone") redirect(withFlash(BACK, "user-mobile"));
  const saved = await createDriver(driver, user.name);
  if (saved === "exists") redirect(withFlash(BACK, "driver-exists"));
  await logActivity(user, "driver.created", who(driver));
  done("driver-added", driver.name);
}

export async function editDriver(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const before = await getDriver(Number(fd.get("id")));
  if (!before) redirect(withFlash(BACK, "not-found"));
  const driver = readDriver(fd);
  if (driver === "name") redirect(withFlash(BACK, "driver-name"));
  if (driver === "phone") redirect(withFlash(BACK, "user-mobile"));
  if (driver.name === before.name && driver.phone === before.phone) done("trip-unchanged", driver.name);
  const saved = await updateDriver(before.id, driver, user.name);
  if (saved === "exists") redirect(withFlash(BACK, "driver-exists"));
  if (saved === "missing") redirect(withFlash(BACK, "not-found"));
  await logActivity(user, "driver.updated", who(driver), `Was ${who(before)}`);
  done("driver-updated", driver.name);
}

export async function driverStatus(fd: FormData) {
  const user = await requireUser("manageExpenses");
  const driver = await getDriver(Number(fd.get("id")));
  if (!driver) redirect(withFlash(BACK, "not-found"));
  const action = String(fd.get("action"));

  if (action === "delete") {
    if (!(await deleteUnused("drivers", driver.id))) redirect(withFlash(BACK, "driver-in-use", driver.name));
    await logActivity(user, "driver.deleted", who(driver));
    done("driver-deleted", driver.name);
  }
  const active = action === "activate";
  if (!(await setActive("drivers", driver.id, active, user.name))) redirect(withFlash(BACK, "not-found"));
  await logActivity(user, active ? "driver.reactivated" : "driver.deactivated", who(driver));
  done(active ? "driver-on" : "driver-off", driver.name);
}

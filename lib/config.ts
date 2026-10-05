export const BUSINESS = {
  name: "Annapurna Online Services",
  travelName: "Annapurna Tours & Travels",
  phone: "9949810683",
  phoneDisplay: "99498 10683",
  email: "mclaponline@gmail.com",
};

/** Dashboard roles. All users, including the one super admin, are stored in the users table. */
export type Role = "super_admin" | "admin" | "viewer";

export type CarId = "carens" | "seltos";

export type Car = {
  id: CarId;
  name: string;
  /** Most adults (12+) allowed */
  maxAdults: number;
  /** Most people allowed in total, adults + children */
  maxTotal: number;
};

// Keep in sync with the car_capacity constraint in db/schema.sql
export const CARS: Record<CarId, Car> = {
  carens: { id: "carens", name: "Kia Carens", maxAdults: 6, maxTotal: 7 },
  seltos: { id: "seltos", name: "Kia Seltos", maxAdults: 4, maxTotal: 4 },
};

export const CAR_IDS = Object.keys(CARS) as CarId[];

export function isCarId(value: unknown): value is CarId {
  return value === "carens" || value === "seltos";
}

export const BOOKING_RULES = {
  /** Longest trip a customer can request */
  maxDays: 7,
  /** How far ahead (in days, from tomorrow) customers can book */
  windowDays: 90,
  /** A half-finished WhatsApp booking is forgotten after this long */
  sessionTimeoutMinutes: 30,
};

export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled";

export function passengersText(adults: number, children: number): string {
  const a = `${adults} adult${adults === 1 ? "" : "s"}`;
  if (!children) return a;
  return `${a} + ${children} ${children === 1 ? "child" : "children"}`;
}

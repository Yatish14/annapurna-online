/**
 * The booking form's values and their defaults. Kept out of TripForm (a client component) so server pages can
 * use them: a server page importing a value from a "use client" file gets an empty stand-in, not the object.
 */

export type TripFormValues = {
  vehicle_id: string;
  driver_id: string;
  customer_name: string;
  customer_phone: string;
  start_date: string;
  end_date: string;
  pickup_state: string;
  pickup_city: string;
  drop_state: string;
  drop_city: string;
  round_trip: boolean;
  dest_state: string;
  dest_city: string;
  referrer_name: string;
  referrer_phone: string;
  notes: string;
  odometer_start: string;
  odometer_end: string;
  /** Km typed in instead of the odometer readings */
  km_direct_on: boolean;
  km_direct: string;
  total_amount: string;
  advance_amount: string;
  advance_method: string;
  driver_amount: string;
  fuel_amount: string;
  fuel_litres: string;
};

export const EMPTY_TRIP: TripFormValues = {
  vehicle_id: "",
  driver_id: "",
  customer_name: "",
  customer_phone: "",
  start_date: "",
  end_date: "",
  pickup_state: "",
  pickup_city: "",
  drop_state: "",
  drop_city: "",
  round_trip: false,
  dest_state: "",
  dest_city: "",
  referrer_name: "",
  referrer_phone: "",
  notes: "",
  odometer_start: "",
  odometer_end: "",
  km_direct_on: false,
  km_direct: "",
  total_amount: "",
  advance_amount: "",
  advance_method: "cash",
  driver_amount: "",
  fuel_amount: "",
  fuel_litres: "",
};

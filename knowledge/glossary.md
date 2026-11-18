# Glossary

This glossary gives short definitions of the terms, numbers and labels that admins meet in the Annapurna dashboard.

## Booking number, enquiry reference and print order number

The dashboard uses three kinds of numbers:

- **Booking number (VB-…)**: one car booking in the Expense Tracker. They run VB-0001, VB-0002 and so on; after VB-9999 comes VB-10000.
- **Enquiry reference (AN-…)**: a car enquiry from the WhatsApp booking bot, such as AN-1001. That module is currently hidden from the menu.
- **Print order number (P-…)**: a printout order sent from the counter QR code page, such as P-1042. The customer shows it at the counter.

## Total, billed, received and advance

- **Total** ("Total from customer") is the amount agreed with the customer for a booking. In reports and on the Overview, the sum of totals is called **billed**.
- **Received** is what the customer has actually paid so far: the sum of the booking's customer payments, not counting removed ones.
- **Advance** is money paid before the trip. On the New booking form it is entered as **Advance received**, and it is saved as the booking's first customer payment. It can't be more than the total.

## Balance due and payment status

The **balance due** of a booking is the total minus what has been received: what the customer still has to pay. It is never shown below zero, and it says **Fully paid** when nothing is left. It needs the total to be entered. Every booking that is not cancelled also has a payment badge, worked out automatically:

- **Paid**: received is at least the total.
- **Partly paid**: something is received, but less than the total.
- **Payment due**: a total is set but nothing is received yet.
- **Total not set**: no total entered yet.

## Driver amount, still to pay and settled

The **driver amount** ("Amount for the driver") is the pay agreed with the driver for one booking. **Still to pay** is the driver amount minus the payments made to the driver on that booking. **Settled** means the driver has been paid the full driver amount. On a driver's page, **Earned** is the sum of their agreed driver amounts.

## Trip status: Upcoming, On trip, Completed, Cancelled

A booking's trip status is worked out from its dates:

- **Upcoming**: the start date is after today.
- **On trip**: today is between the start date and the end date.
- **Completed**: the end date has passed.
- **Cancelled**: the booking was cancelled with **Cancel booking**. Its dates are free again, and **Restore booking** brings it back.

## Round trip, drop, destination and referrer

A **round trip** is a booking where the vehicle comes back to the pickup city; the form then asks for the **destination** (where the vehicle went) instead of the drop. For a one-way trip, the **drop** is the state and city where the customer was left. The **referrer** ("Referred by") is the person who sent the customer to the business: an optional name and mobile number on the booking.

## Other expenses and vehicle costs

**Other expenses** are trip costs besides fuel, recorded on one booking, such as tolls, parking, permits or the driver's food. On vehicle pages and reports they appear as **Tolls & other**. **Vehicle costs** belong to a vehicle instead: repairs and servicing, FASTag recharges, EMI (loan instalments) and insurance premiums. Other expenses reduce the booking's profit; vehicle costs reduce only the vehicle's and the month's profit.

## Profit and profit once fully paid

A booking's **profit** is received − driver amount − fuel − other expenses, so it counts only money actually received. **Profit once fully paid** uses the total instead of received: what the profit will be when the customer pays the full balance. In the Bookings report, **Bookings profit** adds up booking profits, and **Total profit** also takes off the month's repairs, FASTag, EMI and insurance.

## Money in, money out and net (cash vs profit)

**Money in**, **Money out** and **Net** on the Overview are cash figures: payments actually made during the month, whatever booking they belong to. Net is money in minus money out. **Profit** in the reports is counted on the bookings that start in the month. So a month's net and the same month's profit can differ, for example when a customer pays this month for last month's trip.

## Expense statement

An **expense statement** is the one-page PDF for a car customer, from Annapurna Tours & Travels. It shows the total, each payment received and the balance to pay, or "Fully paid". It is never called an invoice or bill, because the business has no GST registration. Download it with **Expense statement (PDF)** on the booking's page.

## Switched off and removed entries

A vehicle or driver that is **switched off** can't be picked for new bookings, but its history is kept. Vehicles and drivers with bookings can only be switched off, never deleted. A payment or cost entered by mistake can be **removed**: it stays in its list crossed out, with who removed it and when, and no longer counts in any total.

## Activity log and History

The **activity log** records who did what and when: bookings, payments, costs, vehicles, drivers, print orders, users, and PDF downloads. It is shown on the **Activity** pages of each module and, for one booking, in the booking's **History** panel. Only admins and the super admin can see it. Entries made through Annapurna Assist are marked "via Annapurna Assist".

## View only and drafts

**View only** is how viewers see the dashboard: every button is visible but greyed out, and pressing one shows a short message saying why. The server refuses changes from viewers.

A **draft** is a booking, payment or fuel entry that Annapurna Assist has prepared and checked but not saved. It is shown as a card with **Confirm**, a button to open it in the form, and **Cancel**. Nothing is saved until you press Confirm, and a draft expires after 24 hours.

## Badges and messages

- A **Sample** badge marks sample bookings, vehicles and drivers added for testing. They are not real business records.
- **Toasts** are the short messages at the top right after an action: green for done, amber for a warning, red for an error.

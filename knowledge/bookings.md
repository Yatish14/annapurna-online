# Car Bookings Guide

This guide explains how to create, find, edit, cancel and restore car bookings in **Expense Tracker → Bookings**, and what the booking tabs and badges mean.

## Where car bookings live

Car bookings for the business's own vehicles are kept in **Expense Tracker → Bookings** in the sidebar. Each booking gets a booking number such as VB-0042. Each booking shows as a card with the customer, vehicle, driver, route and money owed. Click anywhere on a card, or press **Open booking**, to open the booking's own page. The **New booking** button is at the top right of the Bookings page and also on **Expense Tracker → Overview**. There is no separate calendar in the Expense Tracker; use the **Upcoming** and **On trip** tabs to see what is coming up and who is on the road.

## Booking tabs on the Bookings page

The Bookings page has six tabs, each with a count:

- **All**: every booking, newest start date first.
- **Upcoming**: bookings that start after today.
- **On trip**: bookings where today is between the start and end date.
- **Completed**: bookings whose end date has passed.
- **Payment due**: bookings with a total entered where the customer has not paid it all yet.
- **Cancelled**: bookings that were cancelled.

Only bookings that are not cancelled appear in Upcoming, On trip, Completed and Payment due.

## Searching for a booking

To find a booking, type in the search box on **Expense Tracker → Bookings** (it says "Booking no., name or mobile"). The search looks through every booking, not only the open tab. It matches the booking number (like VB-0004), the customer's, driver's or referrer's name, the vehicle name, or a mobile number. Press **Clear search** to go back to the tab.

## Creating a new booking

1. Open **Expense Tracker → Bookings** and press **New booking**.
2. Under **Customer**, enter the **Customer name** and **Customer mobile number**.
3. Choose the **Vehicle** and **Driver**. If they are not in the list, press **+ New vehicle** or **+ New driver** to add one without leaving the form.
4. Choose the **Start date** and **End date**.
5. Choose the **Pickup** state and city. Then either switch on **Round trip** and choose where the vehicle went, or fill in the **Drop** state and city.
6. Optionally fill in **Referred by** (name and mobile number) and **Notes**.
7. Optionally fill in **Money, fuel and km** now, or later on the booking's page.
8. Press **Create booking**. The booking's page opens with its new number.

## Rules the booking form checks

The booking form refuses to save until these rules are met:

- Customer name: 2 to 60 letters. Mobile number: 10 digits starting with 6, 7, 8 or 9 (+91 or a leading 0 is accepted and removed).
- A vehicle and a driver must be chosen. Switched-off vehicles and drivers can't be picked for new bookings.
- The end date can't be before the start date, and a booking can be at most a year long.
- Pickup state and city are required. A round trip needs the destination state and place; otherwise the drop state and city are required. A city that isn't in the list can be typed in.
- A referrer's mobile number needs the referrer's name too.
- The advance can't be more than the total.
- The odometer reading at the end can't be lower than at the start, and an end reading needs a start reading.

## Vehicle and driver clashes

A vehicle can't have two bookings on the same days. If the vehicle is already booked, the form shows which booking clashes and asks you to choose other dates or another vehicle. The database refuses double bookings too. A driver who is already on another booking only gives a warning, **Driver already busy**, with two buttons: **Change driver** or **Save anyway**.

## Editing a booking

To edit a booking, open it and press **Edit details**. The edit form is the same as the new booking form, and also shows the money, fuel and km as saved. You can change the total, driver amount and km there. A payment or fuel amount typed in the edit form is added as a new entry, not a replacement. With that payment, the customer can't have paid more than the total. To correct or remove an existing payment or cost, use the booking's page instead. Press **Save changes** when done. Cancelled bookings can't be edited until they are restored.

## Cancelling and restoring a booking

To cancel a booking, open it and press **Cancel booking**, then confirm. The vehicle becomes free on those days. Payments and costs stay recorded. A cancelled booking can't be edited, and no payments, fuel or other expenses can be added to it.

To undo a cancellation, open the booking and press **Restore booking**. Restoring fails if the vehicle has been booked on those days since then.

## WhatsApp car enquiries (hidden module)

The app also has a **Car Bookings** module for enquiries that customers send through the WhatsApp booking bot (reference numbers like AN-1001). It is currently hidden from the sidebar, because it is only allowed with commercial (yellow-plate) cars. Its pages still exist: enquiries arrive as **Pending**, and an admin can press **Mark as Booked** (the customer gets a confirmation on WhatsApp) or **Reject** (the customer is told the car isn't available). A booked trip can be cancelled with **Cancel booking**, but no message is sent, so call the customer. Its tabs are Pending, Booked, Rejected, Cancelled and All, and it has an availability calendar per car. These enquiries are separate from Expense Tracker bookings.

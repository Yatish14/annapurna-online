# Payments Guide

This guide explains how to record money received from customers and money paid to drivers on a booking, and what total, received, balance due and still to pay mean.

## Where payments are recorded

Every payment belongs to one booking. Open the booking from **Expense Tracker → Bookings** to see two payment panels:

- **Customer payments**: money the customer paid us.
- **Payments to driver**: money we paid the booking's driver.

Each panel shows a list of payments with the amount, how it was paid, the date and time, any note, and who recorded it. Payments can't be added to a cancelled booking; restore it first.

## Recording a customer payment

1. Open the booking from **Expense Tracker → Bookings**.
2. In the **Customer payments** panel, press **Record customer payment**.
3. Enter the **Amount (₹)**. It starts filled in with the balance still due, so change it if the customer paid less.
4. Choose **Paid by**: Cash, UPI, Bank transfer or Other.
5. Check **When** the payment was made. It can't be in the future.
6. Optionally add a **Note**, such as "Final payment".
7. Press **Save payment**.

Amounts are in rupees, up to two decimal places, and at most ₹1 crore.

## Recording a payment to the driver

1. Open the booking from **Expense Tracker → Bookings**.
2. In the **Payments to driver** panel, press **Record payment to driver**.
3. Enter the **Amount (₹)**, choose **Paid by** and check **When**.
4. Optionally add a **Note**, such as "Batta for 2 days".
5. Press **Save payment**.

A driver payment is always tied to one booking. To see everything a driver is owed across bookings, open the driver from **Expense Tracker → Vehicles & drivers**.

## The advance on a new booking

The advance is the first payment the customer makes. On the **New booking** form, under **Money, fuel and km**, enter **Advance received (₹)** and choose **Advance paid by**. It is saved as the booking's first customer payment. The advance can't be more than the total. In the **Edit details** form, the same box is called **Add a payment received (₹)** and adds another payment; with it, the customer can't have paid more than the total.

## Setting the total and the driver amount

The balance can only be worked out once the total is entered. To set the total or the driver amount, open the booking and use the **Readings and amounts** panel: fill in **Total from customer (₹)** and **Amount for the driver (₹)**, then press **Save**. They can also be entered on the New booking form or with **Edit details**. Until they are entered, the panels show "Not set".

## What total, received and balance due mean

On a booking:

- **Total** is the amount agreed with the customer for the trip.
- **Received** is the sum of all customer payments recorded so far.
- **Balance due** is total minus received: what the customer still has to pay. It is never shown below zero. When nothing is left, it says **Fully paid**.

If more was received than the total, the panel shows a note saying how much extra was received. The **To collect from customers** figure on the Overview adds up balances over all bookings and all months.

## What driver amount, paid and still to pay mean

- **Driver amount** is the pay agreed with the driver for this booking.
- **Paid to driver** is the sum of the payments to the driver recorded so far.
- **Still to pay** is the driver amount minus what was paid. When nothing is left, it says **Settled**.

The **To pay drivers** figure on the Overview adds this up over all bookings and all months.

## Payment status badges

Each booking that is not cancelled shows a payment badge, worked out from the total and the payments (it is never typed in):

- **Paid**: received is at least the total.
- **Partly paid**: some money is received, but less than the total.
- **Payment due**: a total is set but nothing is received yet.
- **Total not set**: no total entered yet.

## Removing a payment entered by mistake

To remove a wrong payment, press the trash (Remove) button next to it on the booking's page and confirm. The payment stays in the list, crossed out, with who removed it and when. It no longer counts in received or paid, so the balance due and the driver's still to pay update straight away. Payments can't be edited: to correct an amount, method or date, remove the wrong payment and record the right one. The removal is also recorded in the booking's History.

## Sending the balance to a customer

On a booking's page, two things help collect money:

- **Send balance on WhatsApp** opens a WhatsApp chat with the customer and a ready message with the total, paid and balance to pay. When the booking is fully paid, the link is called **Message on WhatsApp** and the message says thank you.
- **Expense statement (PDF)** downloads a one-page statement for the customer with the total, each payment received and the balance. It appears once the total is entered and the booking is not cancelled. See the reports guide for details.

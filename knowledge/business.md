# Business Information Guide

This guide lists the basic facts about the business that are built into the app: its names, contact details, cars and their seat limits, and the booking and printout rules.

## Business names and contact details

The business works under three names:

- **Annapurna Online Services**: the main business, for printouts and online services.
- **Annapurna Graphics and Internet**: the name on the print shop's counter QR poster and on the WhatsApp balance messages sent to customers.
- **Annapurna Tours & Travels**: car rentals with a driver. Customer expense statements come from this name.

The business's contact details are:

- **Phone**: 99498 10683
- **Email**: mclaponline@gmail.com

The phone number appears in the privacy note on the customer print page, for customers who want their files deleted sooner. The expense statement PDF leaves out the phone number and email.

## Cars and seat limits

The WhatsApp booking bot offers two cars, each with a driver:

- **Kia Carens**: up to 6 adults, and up to 7 people in total with children.
- **Kia Seltos**: up to 4 people in total.

A child is under 12. The bot skips the children question when the car is already full with adults. These limits are also enforced by the database for WhatsApp enquiries. In the Expense Tracker, the vehicles are whatever cars the admins add on **Vehicles & drivers**.

## WhatsApp booking rules

These rules apply to customers booking through the WhatsApp booking bot:

- A trip can be 1 to 7 days long. Only trip lengths where every day is free are offered.
- Customers can book a start date from tomorrow up to 90 days ahead. Only free dates are shown.
- A half-finished WhatsApp conversation is forgotten after 30 minutes. The customer can type **menu** at any time to start again.
- A finished enquiry is saved as pending with a reference like AN-1001, until an admin marks it booked or rejects it.

The WhatsApp Car Bookings module is currently hidden from the dashboard menu, because it is only allowed with commercial (yellow-plate) cars.

## Expense Tracker booking rules and payment methods

Bookings typed into **Expense Tracker → New booking** follow their own rules, not the WhatsApp ones:

- A booking can be up to a year long; there is no 7-day or 90-day limit.
- A vehicle can't have two bookings on the same days.
- A driver on two bookings at once only gives a warning.
- Booking numbers run VB-0001, VB-0002 and so on.

Payments to and from the business are recorded with one of four methods: **Cash**, **UPI**, **Bank transfer** or **Other**.

## Printout rules

The print shop's online upload rules are:

- Customers upload from their phone by scanning the counter QR code.
- Up to 10 files per order, each up to 25 MB.
- Customers choose colour or black & white, single or double-sided, pages and copies for each file.
- Customers' names and mobile numbers are optional.
- Files are deleted automatically 3 days after upload, or sooner if the customer asks.
- Print order numbers look like P-1042.

The app does not store printout prices.

## Invoices, time zone and money format

The business has no GST registration. So the PDF given to a car customer is called an **expense statement**, never an invoice or bill. It shows only amounts: the total, the payments received and the balance.

All dates and times in the dashboard are India time (IST). "Today" in lists and reports, and the reset of Annapurna Assist's daily question limit at midnight, both follow India time. Amounts are in rupees with Indian commas, for example ₹1,25,000.

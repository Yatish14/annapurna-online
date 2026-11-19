# Printouts Guide

This guide explains how customers send documents to print from their phone, and how admins print them and mark orders collected in **Printout → Orders**.

## How customers send a printout

Customers send files from their own phone, with no WhatsApp or email needed:

1. The customer scans the QR code poster at the counter. It opens the "Print from your phone" page.
2. They press **Choose files** and pick one or more files (**Add more files** adds more).
3. For each file they choose **Print in** (Black & white or Colour), **Sides** (Single-sided or Double-sided), **Pages** (All pages, or Choose pages such as 1-3, 5) and **Copies**. Pages can't be chosen for photos.
4. Optionally they enter their **Name** and **Mobile number**, so the shop can call if there's a problem.
5. They read the privacy note and press **Send for printing**.

They then see an order number, such as P-1042, to show at the counter.

## Files customers can upload and upload limits

The print page accepts PDF, Word, Excel, PowerPoint, OpenDocument, RTF, text and CSV files, and photos (JPG, PNG, WebP, GIF, BMP, HEIC, TIFF). ZIP and other archives, programs and web pages are refused. An order can have up to 10 files of up to 25 MB each. The server also checks that each file really is what its name says. Copies can be set from 1 to 99 per file. To stop abuse, the print page allows at most 60 uploads and 20 orders per network per hour, and 300 uploads per day in total.

## The customer's confirmation page

After sending, the customer sees "Sent for printing!" with the order number and its status. They are told to show the order number at the counter, and that a screenshot helps. The status shows:

- **Waiting to print**: the files arrived and haven't been printed yet.
- **Printed**: the printouts are ready to collect.
- **Collected**: the customer has collected the order.

## The Print orders page

Open **Printout → Orders** to see print orders. The sidebar shows a badge with the number of new orders. The page refreshes by itself, and new orders arrive with a chime. Tabs with counts are **New**, **Printed**, **Collected** and **All**. The search box finds an order by its number (like P-1042), the customer's name or mobile number. Each order card lists its files with the customer's options as chips: colour, sides, pages and copies.

## Printing an order

1. Open **Printout → Orders** and find the order in the **New** tab.
2. For each file, press **Print**. The browser's print dialog opens with the file exactly as uploaded, and a note shows the options to choose in the dialog (colour, sides, pages, copies).
3. Word, Excel, PowerPoint, iPhone (HEIC) and TIFF files show **Download to print** instead. They download, to open and print in their own app (Ctrl+P).

On phones and tablets, the file opens in a new tab to print from there. **Open** shows a file in a new tab without printing. Each file pressed is marked printed with who printed it. Once every file in the order is printed, the order moves to **Printed**.

## Marking an order collected

1. When the customer comes to the counter, ask for the order number and search for it on **Printout → Orders**.
2. Hand over the printouts and press **Mark collected** on the order.

If the order hasn't been printed yet, the app asks before marking it collected anyway. The order moves to the **Collected** tab, the card shows who marked it and when, and the customer's confirmation page shows **Collected**. If it was marked by mistake, press **Undo collected**.

## Pausing uploads

When the shop is closed or busy, press **Pause** at the top of **Printout → Orders** and confirm. The status changes from **Accepting uploads** to **Uploads paused**, and the customer's print page says "We're not taking uploads right now" and asks them to come to the counter. Orders already sent stay on the Orders page and can still be printed. Press **Resume** to accept uploads again. Pausing and resuming are recorded in **Printout → Activity**.

## Deleting customers' files

Customers' files are stored privately: only signed-in dashboard users can open them. They are deleted automatically 3 days after upload; the order record stays and the file shows "File deleted". If a customer asks for their files to be deleted sooner, press **Delete files now** on the order and confirm. The files can't be printed or opened again, but the order record is kept.

## The counter QR poster

To print the poster for the counter, open **Printout → QR poster** ("Counter QR code") and press **Print poster**. To save just the QR code as an image, press **Download QR**. The code holds a short link that opens the customer print page. It is a plain code so that old and cheap phone cameras can read it. Phones show the link and wait for a tap before opening it.

## Viewers and printouts

Viewers can open **Printout → Orders** and **Printout → QR poster**, search orders and open customers' files (**Open**, or **Download** for Word, Excel and similar files). They can't print, mark orders collected, undo collected, pause or resume uploads, or delete files. Those buttons show greyed out, and the Orders page shows a "View only" note; pressing a button explains that printing and marking orders is for admins. Viewers also can't open **Printout → Activity**.

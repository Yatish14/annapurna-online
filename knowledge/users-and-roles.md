# Users and Roles Guide

This guide explains the three dashboard roles (super admin, admin and viewer), what each can do, how to add and remove users, and how to sign in and change your password.

## The three roles

Everyone who signs in to the dashboard has one role:

- **Super admin**: the owner. There is exactly one. Can do everything, and is the only one who can add users and reset other users' passwords. Can't be removed.
- **Admin**: added by the super admin. Manages the day-to-day work: printouts, the Expense Tracker, Annapurna Assist, Activity, and removing other users.
- **Viewer**: added by the super admin. Can only look. Shown on the Add a user form as "Can only look".

Your name and role are shown at the bottom of the sidebar.

## What an admin can do

An admin can:

- Print customers' files, mark print orders collected, pause and resume uploads, and delete files early.
- Do everything in the Expense Tracker: bookings, payments, fuel, other expenses, repairs, FASTag, EMI, insurance, vehicles and drivers.
- Use Annapurna Assist: ask questions and confirm drafts.
- See the **Activity** pages and the **Users & roles** page.
- Remove other users, but not the super admin and not themselves.

An admin can't add users or reset other users' passwords. Those buttons show greyed out with "Only the super admin can add users or reset passwords."

## What a viewer can do

A viewer can open print orders (and open the files), all Expense Tracker pages, and Annapurna Assist, but can't change anything. Viewers see the same buttons as an admin, greyed out. Pressing one shows a short message saying why, ending with "Ask the super admin if you need access." Viewers can't see the activity log or the Users & roles page; those menu items are greyed out too. In Annapurna Assist, viewers can look around but can't ask questions or confirm drafts. The server refuses any change from a viewer, even if a button is forced.

## Signing in and out

Everyone signs in at the dashboard sign-in page with their **mobile number** and **password**. The sign-in page is linked from the website's footer. A sign-in lasts up to 7 days on that device. To sign out, press **Log out** at the bottom of the sidebar. An admin or viewer who forgets their password should ask the super admin to reset it. A user who is removed, or whose password is reset, is signed out straight away.

## Adding a user (super admin only)

1. Open **Users & roles** in the sidebar.
2. In the **Add a user** panel, enter the **Full name** and **Mobile number**.
3. Choose the **Role**: **Viewer** (can only look) or **Admin** (manages bookings).
4. Enter a **Password** of at least 8 characters.
5. Press **Add user**.

Share the password with the new user privately. They sign in with their mobile number and that password. There can only be one super admin, so new users are always admins or viewers.

## Resetting a user's password (super admin only)

If an admin or viewer forgets their password, the super admin can set a new one:

1. Open **Users & roles**.
2. In the **Team** list, press **Reset password** next to the user.
3. Enter the new password (at least 8 characters) and press **Save password**.

The user is signed out everywhere immediately. Share the new password with them privately; they use it the next time they sign in. The super admin's own forgotten password can only be reset by whoever runs the app's server.

## Removing a user

To remove an admin or viewer, open **Users & roles**, press **Remove** next to the user in the **Team** list, and confirm. They are signed out immediately and can no longer access the dashboard. Admins and the super admin can remove users. Nobody can remove the super admin, and you can't remove yourself. Removing a user doesn't remove their work: bookings, payments and activity entries they made stay, with their name.

## The Team list

**Users & roles** shows the **Team** list: each person's name, mobile number, role, last sign-in (or "Never signed in"), when and by whom they were added, and when their password was last changed. Your own entry is marked **You**. The super admin is marked "Owner · can't be removed". Admins and the super admin can open this page; viewers see the menu item greyed out. Adding, removing and password resets are also recorded in the activity log.

## Changing your own password

Anyone, including viewers, can change their own password:

1. Click your name at the bottom of the sidebar to open **My account**.
2. Under **Change password**, enter your **Current password**.
3. Enter the **New password** (at least 8 characters) and **Type the new password again**.
4. Press **Update password**.

You stay signed in on this device; any other devices are signed out.

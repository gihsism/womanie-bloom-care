# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/7cbac8a4-6624-453f-bf4b-7137d5f21846

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/7cbac8a4-6624-453f-bf4b-7137d5f21846) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/7cbac8a4-6624-453f-bf4b-7137d5f21846) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Admins and onboarding doctors

Admin pages (`/admin/doctors`) and admin API routes (`/api/admin/*`) accept an
account only when BOTH hold (see `api/_lib/admin.ts`):

1. its email is listed in the `ADMIN_EMAILS` env var (comma-separated), and
2. it has signed in with Google at least once (`auth_users.google_id` set).

Password signup never verifies an email address and there is no
`email_verified` column, so a Google link is the proof that the admin owns the
listed address. A password-only account on an admin email is not an admin.

Doctor onboarding (needs migration `db/migrations/023_doctor_onboarding.sql`):

- **Queue**: pending doctors with licence/GLN (format hint), a link to MedReg
  (medregom.admin.ch, link only), approve, or reject/revoke with a reason the
  doctor sees on the doctor login screen. Every action is written to
  `admin_audit_log` (who, when, reason) in the same transaction.
- **Invite**: "Invite a doctor" creates a one-time link for one email (random
  token, stored as a SHA-256 hash, single use, expires after 7 days). The
  doctor registers with the pre-filled email, the account is approved at once
  and she lands on the dashboard setup checklist. Check her in MedReg first.

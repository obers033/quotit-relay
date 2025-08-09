# Quotit Relay + Dynamic Drug Form

## Deploy on Render
1. Create a private GitHub repo.
2. Add these files into the repo.
3. Go to Render → New → Web Service.
4. Connect the repo, set:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Deploy and visit your app’s URL.

## How It Works
- Browser submits lead via `/relay/logquote`
- Relay posts to Quotit and returns the response
- Extracts `ContactId` and auto-submits drugs via `/relay/membersdrugs`

## Health Check
Visit `/relay/health` to confirm the relay is running.

## CORS
Relay is same-origin with the form, so browser CORS issues are avoided.

# Sanctio — Walkthrough Video Script (Simple English, Full Narration)

This script is written so you can read it out loud, word for word, while you record your
screen. Every section has full sentences — there should be no moment where you're
silently clicking around with nothing to say. Speak at a normal, relaxed pace. Target
length is now **7–8 minutes** because the narration is fuller — that's fine, this kind
of walkthrough is meant to explain things clearly, not race through them.

Before you record:
- Run `node scripts/verify-dataset.mjs` and confirm it says all checks passed.
- Open two browser tabs ahead of time: one on the Sanctio app, one already logged into
  the Zoho Projects portal.
- Turn off notifications on your computer.
- Do a silent practice run once, just clicking through, so you know where everything is
  before you record with your voice.

Use the live app: **https://sanctio-loanapp.onslate.in**

---

## 0. Introduction (0:00–0:40)

[Show the login screen. Don't sign in yet. Let it sit on screen while you talk.]

> "Hi, and welcome to Sanctio. Sanctio is a system that helps a bank manage business
> loans, from the moment a customer applies, all the way through approval, and finally
> to the moment the loan money is actually paid out.
>
> What makes Sanctio different is how it's built. Most business software like this
> stores all its information in a private database that only the software itself can
> read. Sanctio does something different. Every single loan file in this system is
> actually a real Project inside Zoho Projects. The stages a loan goes through are
> Project Phases. The paperwork checklist is a list of Project Tasks. The approval
> process is a Zoho Projects Blueprint, which is a step-by-step workflow.
>
> In this video, I'll first show you the finished app, screen by screen, from the point
> of view of the three different people who use it. Then, at the very end, I'll switch
> over and show you the exact same loan file sitting inside Zoho Projects itself, so you
> can see with your own eyes that this claim is true."

---

## 1. Signing in as the Relationship Manager (0:40–1:10)

[Click "Sign in as Relationship Manager, Meera Raghavan"]

> "Let's begin. This application has three different types of users, and each one is
> only allowed to do certain things. This isn't just something hidden in the design —
> it's actually enforced by the server itself, so one type of user can never do another
> type's job, even by accident.
>
> I'll start by signing in as the Relationship Manager. In a real bank, this is the
> person who meets the customer, collects their documents, and creates the loan
> application in the first place. Her name in this demo is Meera Raghavan."

---

## 2. The Pipeline page (1:10–2:30)

[Wait for the Pipeline page to load. Let the columns be visible.]

> "This page is called the Pipeline. It's the main working screen for a Relationship
> Manager. Every loan that is currently active in the bank shows up here as a small
> card. The cards are arranged into columns, and each column is one stage of the loan
> process — for example, document collection, credit review, and so on. If a loan is
> taking too long to move forward, its card changes color, so it's easy to spot trouble
> at a glance.
>
> Right now, in this demo, there are fifteen loans active, and together they add up to
> about six hundred and forty-nine crore rupees. That's the total size of the loan book
> you're looking at."

[Point at the "Needs Attention" panel]

> "At the top of the page is a box called 'Needs Attention.' This is one of my favorite
> parts of the design, so let me explain why it matters. In a lot of banking software,
> a user has to check four or five different screens to find out what needs their
> attention today — one screen for late files, another for pending approvals, another
> for paperwork that's due, and so on. Here, all of that is combined into a single
> list, sorted so the most urgent items are at the top. It saves the user from having
> to go hunting."

[Click the collapse arrow on Needs Attention, then click it again to reopen]

> "You can collapse this box if you don't need to see it right now, and everything else
> on the page simply moves up to fill the space. It's a small detail, but it keeps the
> screen feeling tidy."

[Scroll to find LN-2026-0041, Tiruppur Knitwear Exports]

> "Now, let me point out one specific loan file, because I want to come back to it later
> in this video. This one belongs to a company called Tiruppur Knitwear Exports. It has
> been sitting in the Credit Appraisal stage for nineteen days, but the bank's rule is
> that this stage should only take seven days. So this file is quite late.
>
> I want to be clear — I didn't just find this by accident. I deliberately set up this
> loan to be late, on purpose, so I could show you what happens when a loan runs past
> its deadline. The system already noticed this delay on its own and sent out an
> automatic warning message. I'll prove that to you later in this video, when I show
> you the Zoho Projects side."

---

## 3. Opening a loan file in detail (2:30–3:30)

[Click into LN-2026-0041 to open the full loan file]

> "Let's open this loan file and look inside. When you open any loan, you land on a
> detailed view that brings together everything about it in one place. At the top, you
> can see who the borrower is, how much money they're asking to borrow, and their
> credit rating. Below that is a timeline showing every stage the loan has passed
> through, and exactly how many days each stage actually took — not just whether it's
> done, but how long it really took, which is very useful for a bank that wants to spot
> slow stages."

[Scroll down to show conditions, documents, and audit trail]

> "Further down the page, you'll find the list of conditions that must be satisfied
> before the loan can move forward, a vault of uploaded documents like financial
> statements and legal papers, and an audit trail. The audit trail is simply a running
> history of every comment and action taken on this file, each one with a timestamp and
> the name of the person who did it. This means that months later, anyone can look back
> and see exactly what happened and who did it, which is very important for a bank that
> has to answer to regulators."

---

## 4. Signing in as the Credit & Risk Officer (3:30–5:00)

[Sign out, then from the login screen sign in as "Credit & Risk Officer, Arjun Iyer"]

> "Now I'm going to sign out and sign back in as a different type of user: the Credit
> and Risk Officer. In a real bank, this is a more senior person whose job is to review
> the loan closely, judge how risky it is, and decide whether to approve it, and under
> what conditions. His name in this demo is Arjun Iyer."

[Open Credit Desk]

> "This page is called Credit Desk, and it's specific to this type of user. It shows a
> list of problems that need a decision. In this system, we call these problems
> 'deviations,' which simply means the loan doesn't fully match the bank's normal
> lending rules in some way — maybe the amount is a bit too high, or the interest rate
> doesn't quite fit the standard, and so on.
>
> Here's the important part: how serious the problem is decides exactly who is allowed
> to approve it. A small, minor problem can be approved by a Credit Manager. A medium
> problem needs the Head of Credit to sign off. And a serious, critical problem needs
> approval from the entire Credit Committee. I want to stress that this rule isn't just
> written down somewhere as a policy that people are supposed to follow — the software
> itself blocks the wrong person from approving it. For example, even if the
> Relationship Manager we saw earlier wanted to approve a loan herself, the system
> simply will not let her, because that's not her role."

[Click "Decide" on the Critical deviation for LN-2026-0038, Kalyani Retail Ventures]

> "Let's look at one of these problems now. This loan belongs to a company called
> Kalyani Retail Ventures, and it has a serious, critical-level problem. There are two
> issues here: first, the total amount the bank would be lending is higher than what's
> normally allowed for this type of business, and second, when we compare the
> borrower's income to their existing debt, it's a bit weaker than the bank would
> normally accept. Because this is critical, it needs sign-off from the Credit
> Committee, which is what I'm representing right now.
>
> I'm going to approve this deviation. But notice that before I can approve it, the
> system requires me to type in a written note explaining my reasoning. I can't just
> click a button and move on — I have to justify the decision in writing, and that note
> becomes a permanent part of this loan's history."

[Type a note explaining the reasoning, then click Approve]

> "And there we go — approved, with my reasoning recorded for anyone to review later."

---

## 5. Signing in as Operations — the blocked payment (5:00–6:00)

[Sign out, then sign in as "Operations, Kavitha Nair"]

> "Now let's look at the third and final type of user: Operations. Once a loan has been
> fully approved, it's this team's job to actually check that every required condition
> has been met, and then release the loan money to the borrower. They are not allowed
> to approve loans at all — their only job is to safely release money once everything
> is in order. Her name in this demo is Kavitha Nair."

[Open LN-2026-0029, Deccan Auto Components]

> "This loan, belonging to Deccan Auto Components, has already been approved by the
> credit team, and the first payment has already gone out successfully. But the second
> payment is currently blocked, and I want to show you exactly why, because this is one
> of the most important safety features in the whole system.
>
> The reason it's blocked is that one required legal step hasn't been completed yet —
> specifically, a legal charge on the company's collateral, which is the property or
> asset backing this loan, hasn't been officially registered yet with the authorities.
> Until that paperwork is done, the bank's own rules say this money should not go out.
>
> Let's see what happens if I, as the Operations user, try to release this payment
> anyway, ignoring that missing step."

[Attempt to release the payment — show that it is refused with the specific reason]

> "As you can see, the system stops me immediately, and it doesn't just show a vague
> error message — it tells me the exact, real reason the payment is blocked: that the
> legal charge hasn't been registered. This means a mistake like accidentally releasing
> money too early simply cannot happen here. The system protects the bank
> automatically, without relying on a person to remember every single rule by heart."

---

## 6. The Deal Desk page — looking at the whole portfolio (6:00–6:45)

[Navigate to the Deal Desk page]

> "This next page is called Deal Desk, and it's a bit different from the others,
> because instead of looking at one loan at a time, it looks at the bank's entire loan
> portfolio all at once. Here you can see how much money is lent out, broken down by
> industry and by credit rating, how much has been officially approved compared to how
> much has actually been paid out so far, and a list of every loan that is currently
> running late.
>
> There's also something clever happening here that's easy to miss. This bank has
> lent money separately to three different companies, and on paper, they look like
> three completely unrelated borrowers. But in reality, all three companies secretly
> belong to the same business group, called the Sundar Group. Looked at one at a time,
> none of these three loans looks risky. But if you add all three together, as one
> connected group, the total amount is close to the bank's safety limit for how much
> it should lend to any single group of related companies. This page automatically
> catches that hidden connection and adds them together correctly, which is exactly
> the kind of risk that's easy for a human to miss but easy for software to catch."

---

## 7. The proof — the same loan file inside Zoho Projects (6:45–7:45)

[Switch to the browser tab with Zoho Projects already open, and open the Project for
LN-2026-0041]

> "Now, here is the moment I promised at the start of this video — the actual proof.
> What you're looking at now is not the Sanctio app anymore. This is Zoho Projects, a
> completely separate, well-known project management tool made by Zoho. And what I've
> opened here is a Project called LN-2026-0041 — the exact same loan file, for Tiruppur
> Knitwear Exports, that we looked at earlier in the video.
>
> Remember the seven stages a loan goes through? Those are simply the Phases of this
> Project. Here is the Credit Appraisal phase — the very one this loan is overdue in.
> And the paperwork checklist you saw earlier is simply the list of Tasks inside this
> Project, in the correct order they need to be completed."

[Open the Comments section of the Project]

> "And here is the proof of the automatic warning I mentioned earlier. This comment was
> posted last night, automatically, by the system itself, the exact moment this loan
> passed its seven-day deadline. No person typed this. A scheduled background job
> checked every loan overnight, found this one was late, and wrote this comment on its
> own."

[Optionally, briefly show the Issues tab or the list of custom modules in the portal]

> "The approval problems you saw earlier, on the Credit Desk page, are stored here as
> Zoho Projects Issues. And all the extra information a loan needs — details about the
> borrower, the specific loan amounts, the property used as security, the risk scoring,
> the conditions that must be met, and the record of payments — all of that lives in
> six custom sections built inside this very same Zoho Projects portal. There is no
> separate, hidden database running behind the scenes anywhere. Everything you've seen
> in this entire video is really stored here, inside Zoho Projects."

---

## 8. Closing (7:45–8:15)

[Return to the Sanctio Pipeline page, or show the project's GitHub page]

> "So, to sum up: Sanctio is a complete business loan management system, but instead of
> being built on a traditional private database, it's built entirely on top of Zoho
> Projects. Every part of a real bank's lending process — the stages a loan moves
> through, the paperwork checklist, the approval decisions, the problems that come up
> along the way, how long each step takes, and the full history of everything that
> happened — all of it is handled using features that Zoho Projects already provides.
>
> While I was building this, I also kept an honest, detailed record of every problem I
> ran into, and exactly how I fixed each one. You can find that in a file called
> BROKE.md inside the project's code repository, in case it's useful to anyone else
> attempting something similar.
>
> Thank you very much for watching."

---

## Recording checklist

- [ ] Run `node scripts/verify-dataset.mjs` first, and confirm every check passes
- [ ] Test all three demo logins on the live site once before you start recording
- [ ] Open the Zoho Projects tab ahead of time and already have LN-2026-0041 found, so
      you don't waste time searching for it on camera
- [ ] Turn off all notifications on your computer before you begin
- [ ] Do one full silent practice run first, just clicking through every step, so you
      know exactly where to click while you're talking
- [ ] Speak a little slower than feels natural — it almost always sounds better in the
      recording than it feels while you're talking
- [ ] If you run short on time, it's safest to shorten Section 6 (Deal Desk) rather than
      cut it completely — Sections 1 through 5 and Section 7 carry the main point of
      the whole video

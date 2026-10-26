# Temporary Access Delegation — Operating Guide

## Grant access (Head of Operations only)
1. Sign in as Head of Operations, open **People**.
2. Find an active employee and select **Manage access**.
3. Select only the tasks needed: **Manage Fleet**, **Set Next Service**, and/or **Correct Machine Hours**.
4. Choose duration: 1, 4, 8 or 24 hours; 3 or 7 days.
5. Explain the reason and select **Save**.
6. The People page shows granted permissions and their expiry dates. The employee may need to refresh the app, or wait for its next permissions refresh (up to 20 seconds).

## Remove access immediately
Open **People → Manage access** for the employee and click **Revoke** beside the permission. Their server-side permission ends immediately; the frontend updates automatically or after refreshing.

## Safeguards
- Employees cannot grant access to themselves or others.
- Grants do not change an employee's permanent role or grant access to user/role administration.
- Access automatically expires at the selected date and time, even if no one opens the app.
- All grants and revocations are recorded in **Audit**. A reason is required.
- Granting a new permission of the same type replaces the previous unrevoked grant without deleting the historical record.
- Correct Machine Hours continues to require its own correction reason and a valid saved meter reading.
- Live Production Time is independent of engine-meter corrections.
- No user has been granted delegated access as part of deployment.

## Access matrix
| Permission | What it enables | What it does not enable |
| --- | --- | --- |
| Manage Fleet | Add/retire machines, adjust machine status and increase hours via existing manager workflow | Decrease readings, change service targets, grant access or manage roles |
| Set Next Service | Set the scheduled machine-hour threshold or date | Edit meter readings, status, or roles |
| Correct Machine Hours | Increase or decrease hour readings with required audit reason | Change next-service targets, manage users, grant access |

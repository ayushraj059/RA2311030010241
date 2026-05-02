# Notification System Design

## Stage 1

### REST API Design for Campus Notification Platform

A frontend developer needs to display notifications to students when they log in. Below are the core REST API endpoints that the notification platform should support.

---

### Endpoints

#### 1. Get All Notifications for a Student

```
GET /api/notifications
Authorization: Bearer <token>
```

**Response**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "TCS Corporation hiring",
      "isRead": false,
      "createdAt": "2026-04-22T17:51:30Z"
    }
  ],
  "total": 25,
  "unreadCount": 8
}
```

---

#### 2. Get Priority Notifications (Top N)

```
GET /api/notifications/priority?limit=10
Authorization: Bearer <token>
```

**Response**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "Google hiring",
      "score": 3.0098,
      "createdAt": "2026-04-22T17:51:30Z"
    }
  ]
}
```

---

#### 3. Mark Notification as Read

```
PATCH /api/notifications/:id/read
Authorization: Bearer <token>
```

**Response**
```json
{
  "id": "uuid",
  "isRead": true,
  "updatedAt": "2026-04-22T18:00:00Z"
}
```

---

#### 4. Mark All Notifications as Read

```
PATCH /api/notifications/read-all
Authorization: Bearer <token>
```

**Response**
```json
{
  "message": "All notifications marked as read",
  "updatedCount": 8
}
```

---

#### 5. Delete a Notification

```
DELETE /api/notifications/:id
Authorization: Bearer <token>
```

**Response**
```json
{
  "message": "Notification deleted successfully"
}
```

---

#### 6. Get Notifications by Type

```
GET /api/notifications?type=Placement
Authorization: Bearer <token>
```

---

### Real-time Notifications

For real-time delivery, I would use **Server-Sent Events (SSE)** rather than WebSockets. The reason is that notifications are one-directional - the server pushes to the client, the client doesn't push back. SSE is simpler, uses regular HTTP, and works well over proxies.

```
GET /api/notifications/stream
Authorization: Bearer <token>
Content-Type: text/event-stream
```

The server keeps the connection open and pushes events as:
```
data: {"id":"uuid","type":"Placement","message":"Google hiring"}
```

If SSE is not feasible (e.g. due to server infrastructure), a fallback would be **long-polling** every 15 seconds.

---

### JSON Schema for a Notification

```json
{
  "id": "string (UUID)",
  "studentId": "string",
  "type": "enum: Placement | Result | Event",
  "message": "string",
  "isRead": "boolean",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

---

## Stage 2

### Persistent Storage - Database Choice

I would choose **PostgreSQL** for this platform.

**Why PostgreSQL and not MongoDB?**

The data here is relational - a student has many notifications, notifications have a fixed schema (id, type, message, isRead, studentId, timestamps). The schema is predictable and won't change randomly. PostgreSQL handles this much better than a document store. Also, queries like "give me all unread Placement notifications for student X, sorted by date" are exactly what SQL is built for. MongoDB can do it too but you lose the benefits of proper indexing and query planning.

**Why not MySQL?**

PostgreSQL has better support for UUID primary keys, JSONB columns if we ever need flexible metadata, and its EXPLAIN ANALYZE output is more useful for debugging slow queries. Both would work, but Postgres is the stronger choice long-term.

---

### DB Schema

```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  roll_no VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_student ON notifications(student_id);
CREATE INDEX idx_notifications_unread ON notifications(student_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications(student_id, type);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
```

---

### Problems as Data Volume Grows

1. **Full table scans** - without indexes, every query scans millions of rows
2. **Write contention** - 50,000 students getting notifications simultaneously creates lock pressure
3. **Index bloat** - too many indexes slow down inserts and updates
4. **Storage** - 5M notifications takes meaningful disk space; old ones pile up
5. **Connection pool exhaustion** - many concurrent users opening DB connections

**Solutions:**
- **Partitioning** - partition the notifications table by `created_at` (monthly partitions). Old partitions can be archived or dropped
- **Read replicas** - send all SELECT queries to a replica, writes go to primary
- **Connection pooling** - use PgBouncer to pool DB connections so the DB isn't overwhelmed
- **Archival** - move notifications older than 6 months to cold storage (S3 + Athena for querying if needed)

---

### SQL Queries

**Get unread notifications for a student (Stage 1 API backing query):**

```sql
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = $1
  AND is_read = FALSE
ORDER BY created_at DESC
LIMIT 50;
```

**Get all students who received a Placement notification in the last 7 days:**

```sql
SELECT DISTINCT s.id, s.name, s.email
FROM students s
JOIN notifications n ON s.id = n.student_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

---

## Stage 3

### Analyzing the Slow Query

The original query:
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

**Is this query accurate?**

Technically it returns the right rows but `SELECT *` pulls every column including message text for potentially thousands of rows. If you're paginating on the frontend, you're fetching data you won't use.

**Why is it slow?**

Without an index on `(studentID, isRead)`, PostgreSQL does a full sequential scan of the entire notifications table. At 5,000,000 rows, this means reading every single row to find the ones matching studentID=1042. Even with an index on just `studentID`, the database still has to scan all notifications for that student and filter by isRead in memory.

**What I'd change:**

```sql
-- create a partial index - only indexes unread rows, much smaller
CREATE INDEX idx_unread_by_student
ON notifications (student_id, created_at DESC)
WHERE is_read = FALSE;

-- then the query becomes:
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = 1042
  AND is_read = FALSE
ORDER BY created_at DESC
LIMIT 20;
```

The partial index only contains unread rows, so it stays small even as total notifications grow. The query now hits the index directly instead of scanning the whole table.

**Computation cost before fix:** O(n) sequential scan - linear with table size
**Computation cost after fix:** O(log n + k) index lookup where k is the result count

---

### Adding Indexes on Every Column - Is That Safe?

**No, this is not good advice.**

Every index you add:
- Slows down INSERT, UPDATE, DELETE because all indexes must be updated
- Takes extra disk space
- Can confuse the query planner into picking wrong indexes

At 50,000 students and 5M notifications, you probably have heavy write traffic (notifications being created constantly). Adding an index on every column would make every notification insert significantly slower.

The right approach is to only index columns that appear in WHERE clauses of frequent queries, and use partial indexes where possible (like the one above that only indexes unread rows).

---

### Find Students Who Got a Placement Notification in Last 7 Days

```sql
SELECT DISTINCT s.id, s.name, s.email
FROM students s
JOIN notifications n ON s.id = n.student_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

With the index `idx_notifications_type` on `(student_id, type)` and a separate index on `created_at`, PostgreSQL can efficiently narrow down to Placement notifications in the date range before joining.

---

## Stage 4

### Caching Strategy - DB is Overwhelmed on Every Page Load

The core problem is that notifications are fetched fresh from the DB every time any student opens the app. With 50,000 students, that's potentially 50,000 DB reads per minute during peak hours.

**Solution: Multi-layer caching with Redis**

**Layer 1 - Per-student notification cache (Redis)**

Cache the notification list for each student with a short TTL (60-90 seconds). Most students don't get new notifications every minute, so serving from cache is fine.

```
Key: notifications:{studentId}
TTL: 60 seconds
Value: JSON array of notifications
```

When a new notification arrives for a student, invalidate that student's cache key. This is called **cache invalidation on write** - it's simple and correct.

**Layer 2 - Unread count cache**

The unread badge count is fetched even more frequently than the full list. Cache it separately with a 30-second TTL.

```
Key: unread_count:{studentId}
TTL: 30 seconds
```

**Tradeoffs:**

| Strategy | Pros | Cons |
|---|---|---|
| Redis per-student TTL | Simple, fast, works immediately | Stale for up to 60s |
| Cache invalidation on write | Always fresh after write | More complex, invalidation can fail |
| No cache | Always fresh | DB gets hammered |

**What I'd implement:** Redis with write-through invalidation. When a notification is created for a student, we delete their cache key so the next read goes to DB and repopulates. The 60s TTL is a safety net in case invalidation fails.

For the priority inbox specifically, computing scores is CPU work on the backend, not DB work - so caching the scored list for 30 seconds is safe and cheap.

---

## Stage 5

### Problems with the notify_all Implementation

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # real-time push
```

**Problems:**

1. **Sequential processing** - 50,000 students processed one by one. If each takes 100ms, that's 5,000 seconds (83 minutes). Placement notifications are time-sensitive.

2. **No error handling** - if `send_email` fails for student 200, do we skip that student and move on? Do we retry? The code doesn't say. The log says `send_email` failed for 200 students midway - with this implementation those students just don't get notified.

3. **DB and email in same transaction** - if we save to DB and then the email fails, the student's notification is marked as "sent" in the DB even though they didn't get the email. Or if we email first and then the DB insert fails, we can't prove we sent it.

4. **No rate limiting** - sending 50,000 emails simultaneously will get the domain rate-limited or blacklisted by email providers.

**Redesigned approach:**

Use a **message queue** (like RabbitMQ or Redis Streams).

```
function notify_all(student_ids: array, message: string):
    # create one job per student and push to queue - returns immediately
    for student_id in student_ids:
        queue.publish("notifications", {
            student_id: student_id,
            message: message,
            created_at: now()
        })
    
    # also save to DB in bulk (one query, not 50k queries)
    db.bulk_insert(notifications_table, student_ids, message)
```

Worker processes (can run multiple in parallel) consume from the queue:
```
function worker():
    while true:
        job = queue.consume("notifications")
        
        try:
            send_email(job.student_id, job.message)
            push_to_app(job.student_id, job.message)
            queue.ack(job)  # mark as done
        catch error:
            queue.nack(job)  # put back in queue for retry
            log_error(job.student_id, error)
```

**Should DB save and email happen together?**

No - they serve different purposes and have different failure modes. Save to DB first (so we have a record regardless of email delivery), then send email asynchronously. If email fails, we can retry from the queue. The DB record is the source of truth.

**Revised pseudocode for the 200-student failure scenario:**

The queue approach handles this automatically. If a worker fails while processing student 200, the message goes back to the queue (nack) and another worker picks it up. Failed students get retried without manual intervention.

---

## Stage 6

### Priority Inbox - Approach and Implementation

**The problem:** Students have many notifications and need to see the most important ones first. "Important" is defined as a combination of type (Placement > Result > Event) and recency (newer is better).

**Scoring formula:**

```
score = type_weight + 1 / (1 + age_in_seconds * RECENCY_SCALE)
```

Where:
- `type_weight`: Placement=3, Result=2, Event=1
- The recency term adds a value between 0 and 1 that decreases as the notification gets older
- `RECENCY_SCALE` controls how fast the recency bonus decays

This means a Placement notification will always score at least 3.0, a Result at least 2.0, and an Event at least 1.0. A brand-new Placement scores close to 4.0. An hour-old Event scores close to 1.0. So Placement beats Result beats Event, but a very recent Event can beat a very old Result if RECENCY_SCALE is tuned appropriately.

**Maintaining top 10 as new notifications arrive:**

I use a **min-heap of size N**. As new notifications arrive:
- If the heap has fewer than N items, add the new one
- Otherwise, compare the new notification's score to the heap minimum
- If the new score is higher, pop the minimum and insert the new one
- If the new score is lower or equal, discard it

This runs in O(k log N) time and uses O(N) memory regardless of total notification count. You never need to sort all notifications - you only track the top N candidates.

See `src/scripts/priorityInbox.ts` for the full implementation.

**Screenshots of output are included in the `/screenshots` folder.**

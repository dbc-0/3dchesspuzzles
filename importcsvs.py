import csv
from collections import defaultdict

INPUT_FILE = 'lichess_db_puzzle.csv'
OUTPUT_FILE = 'filtered_puzzles.csv'

BUCKET_SIZE = 100
PUZZLES_PER_BUCKET = 1000
MIN_RATING = 1000
MAX_RATING = 2500

# Prepare buckets: 1000–1099, ..., 2400–2499
buckets = defaultdict(list)

with open(INPUT_FILE, newline='', encoding='utf-8') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        try:
            rating = int(row['Rating'])
        except ValueError:
            continue

        if MIN_RATING <= rating < MAX_RATING:
            bucket = (rating // 100) * 100
            if len(buckets[bucket]) < PUZZLES_PER_BUCKET:
                buckets[bucket].append(row)

# Flatten and warn if any buckets have too few puzzles
filtered_puzzles = []
for bucket_start in range(MIN_RATING, MAX_RATING, BUCKET_SIZE):
    puzzles = buckets.get(bucket_start, [])
    count = len(puzzles)
    if count < PUZZLES_PER_BUCKET:
        print(f"⚠️  Only {count} puzzles found for rating bucket {bucket_start}-{bucket_start+99}")
    filtered_puzzles.extend(puzzles[:PUZZLES_PER_BUCKET])

# Write filtered puzzles to CSV
if filtered_puzzles:
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as out_csv:
        writer = csv.DictWriter(out_csv, fieldnames=reader.fieldnames)
        writer.writeheader()
        writer.writerows(filtered_puzzles)

    print(f"✅ Saved {len(filtered_puzzles)} puzzles to {OUTPUT_FILE}")
else:
    print("❌ No puzzles matched the criteria.")

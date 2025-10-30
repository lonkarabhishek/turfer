#!/usr/bin/env python3
"""
Import turfs from analyst CSV data to Supabase database
Maps CSV columns to turfs table schema
"""

import csv
import json
import sys
from typing import Dict, List, Any

def parse_sports(sports_str: str) -> List[str]:
    """Parse sports column - could be comma-separated"""
    if not sports_str or sports_str.strip() == '':
        return ['Football']  # Default
    return [s.strip() for s in sports_str.split(',')]

def parse_amenities(amenities_str: str) -> List[str]:
    """Parse amenities column - could be comma-separated"""
    if not amenities_str or amenities_str.strip() == '':
        return []
    return [a.strip() for a in amenities_str.split(',')]

def parse_images(row: Dict[str, str]) -> List[str]:
    """Collect all image URLs from Image 1-5 columns"""
    images = []
    for i in range(1, 6):
        img_key = f'Image {i}'
        if img_key in row and row[img_key] and row[img_key].strip():
            images.append(row[img_key].strip())
    return images

def parse_operating_hours(hours_str: str) -> Dict[str, Any]:
    """Parse playing hours - format TBD based on analyst's data"""
    # Default hours if not provided
    if not hours_str or hours_str.strip() == '':
        return {
            "monday": {"open": "06:00", "close": "23:00"},
            "tuesday": {"open": "06:00", "close": "23:00"},
            "wednesday": {"open": "06:00", "close": "23:00"},
            "thursday": {"open": "06:00", "close": "23:00"},
            "friday": {"open": "06:00", "close": "23:00"},
            "saturday": {"open": "06:00", "close": "23:00"},
            "sunday": {"open": "06:00", "close": "23:00"}
        }

    # Parse custom format if provided
    # Example: "Mon-Fri: 6am-11pm, Sat-Sun: 7am-10pm"
    return {
        "monday": {"open": "06:00", "close": "23:00"},
        "tuesday": {"open": "06:00", "close": "23:00"},
        "wednesday": {"open": "06:00", "close": "23:00"},
        "thursday": {"open": "06:00", "close": "23:00"},
        "friday": {"open": "06:00", "close": "23:00"},
        "saturday": {"open": "06:00", "close": "23:00"},
        "sunday": {"open": "06:00", "close": "23:00"},
        "raw": hours_str
    }

def parse_contact_info(phone: str, email: str, website: str) -> Dict[str, str]:
    """Create contact_info JSON object"""
    contact = {}
    if phone and phone.strip():
        contact['phone'] = phone.strip()
    if email and email.strip():
        contact['email'] = email.strip()
    if website and website.strip():
        contact['website'] = website.strip()
    return contact

def escape_sql_string(s: str) -> str:
    """Escape single quotes for SQL"""
    if not s:
        return ''
    return s.replace("'", "''")

def generate_sql_insert(row: Dict[str, str], owner_id: str) -> str:
    """Generate SQL INSERT statement for one turf"""

    # Required fields
    name = escape_sql_string(row.get('Turf Name', ''))
    address = escape_sql_string(row.get('Address', ''))

    # Optional fields
    description = escape_sql_string(row.get('Description', ''))
    rating = row.get('Ratings', '0').strip() or '0'
    total_reviews = row.get('No. of reviews', '0').strip() or '0'
    price_per_hour = row.get('Price Per Hour', '0').strip() or '0'
    price_per_hour_weekend = row.get('Weekend Price', '').strip() or price_per_hour

    # URLs
    gmap_embed = escape_sql_string(row.get('Google Maps Embed Html Link', ''))
    external_review_url = escape_sql_string(row.get('Link to reviews', ''))

    # Contact info
    phone = row.get('Phone number', '')
    email = row.get('Email', '')
    website = row.get('Website', '')
    contact_info = json.dumps(parse_contact_info(phone, email, website))

    # Parse complex fields
    sports = json.dumps(parse_sports(row.get('Sports', '')))
    amenities = json.dumps(parse_amenities(row.get('Aminites', '')))  # Note: typo in column name
    images = parse_images(row)
    images_json = json.dumps(images)
    cover_image = images[0] if images else ''

    operating_hours = json.dumps(parse_operating_hours(row.get('Playing hours', '')))

    sql = f"""
INSERT INTO public.turfs (
    owner_id,
    name,
    address,
    description,
    sports,
    amenities,
    images,
    cover_image,
    price_per_hour,
    price_per_hour_weekend,
    operating_hours,
    contact_info,
    rating,
    total_reviews,
    "Gmap Embed link",
    external_review_url,
    is_active
) VALUES (
    '{owner_id}'::uuid,
    '{name}',
    '{address}',
    '{description}',
    '{sports}'::jsonb,
    '{amenities}'::jsonb,
    '{images_json}'::jsonb,
    '{cover_image}',
    {price_per_hour},
    {price_per_hour_weekend},
    '{operating_hours}'::jsonb,
    '{contact_info}'::jsonb,
    {rating},
    {total_reviews},
    '{gmap_embed}',
    '{external_review_url}',
    true
);
"""
    return sql

def main():
    if len(sys.argv) < 2:
        print("Usage: python import-turfs-from-csv.py <csv_file> [owner_id]")
        print("If owner_id not provided, you'll be prompted to enter it")
        sys.exit(1)

    csv_file = sys.argv[1]

    # Get owner_id (the user who will own all these turfs)
    if len(sys.argv) >= 3:
        owner_id = sys.argv[2]
    else:
        owner_id = input("Enter the owner_id (UUID) for these turfs: ").strip()

    if not owner_id:
        print("Error: owner_id is required")
        sys.exit(1)

    # Read CSV and generate SQL
    print(f"-- SQL INSERT statements generated from {csv_file}")
    print(f"-- Owner ID: {owner_id}")
    print()

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            if row.get('Turf Name', '').strip():  # Only process rows with a name
                sql = generate_sql_insert(row, owner_id)
                print(sql)
                count += 1

    print(f"\n-- Total turfs to insert: {count}")

if __name__ == '__main__':
    main()

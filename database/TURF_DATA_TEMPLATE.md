# Turf Data Collection Template

Use this template when collecting turf information from Google Forms or manually.

## Required Fields

| Field Name | Type | Example | Notes |
|------------|------|---------|-------|
| name | Text | "O2 FIELD" | Turf name |
| address | Text | "WRJ7+3M Deolali, Maharashtra" | Full address |
| description | Text | "Premium football turf with excellent facilities" | Brief description |

## Dimensions

| Field Name | Type | Example | Notes |
|------------|------|---------|-------|
| height_feet | Number | 20 | Height of enclosure in feet |
| length_feet | Number | 60 | Length in feet |
| width_feet | Number | 40 | Width in feet |
| number_of_grounds | Number | 1 | How many separate boxes/grounds |

## Timing & Pricing

| Field Name | Type | Example | Notes |
|------------|------|---------|-------|
| start_time | Time | "06:00:00" | Opening time (24-hour format) |
| end_time | Time | "23:00:00" | Closing time (24-hour format) |
| price_per_hour | Number | 600 | Weekday price in ₹ |
| price_per_hour_weekend | Number | 800 | Weekend price in ₹ |

## Location

| Field Name | Type | Example | Notes |
|------------|------|---------|-------|
| lat | Decimal | 19.955833 | Latitude (get from Google Maps) |
| lng | Decimal | 73.790278 | Longitude (get from Google Maps) |
| Gmap Embed link | Text | "https://www.google.com/maps/embed?..." | Google Maps embed iframe |
| nearby_landmark | Text | "Near Deolali Railway Station" | Nearby landmark |

## Facilities (Boolean - Yes/No)

| Field Name | Type | Example | Notes |
|------------|------|---------|-------|
| equipment_provided | Boolean | true | Balls, nets provided? |
| parking_available | Boolean | true | Parking available? |
| washroom_available | Boolean | true | Washroom/toilet available? |
| changing_room_available | Boolean | true | Changing room available? |
| sitting_area_available | Boolean | true | Seating for viewers? |

## Condition

| Field Name | Type | Example | Options |
|------------|------|---------|---------|
| net_condition | Text | "good" | excellent, good, fair, needs_replacement |
| grass_condition | Text | "excellent" | excellent, good, fair, needs_maintenance |

## Sports & Amenities (JSONB Arrays)

| Field Name | Type | Example | Notes |
|------------|------|---------|-------|
| sports | Array | ["Football", "Cricket"] | Sports allowed |
| amenities | Array | ["parking", "wifi", "washroom"] | Facilities list |

## Owner Information

| Field Name | Type | Example | Notes |
|------------|------|---------|-------|
| owner_name | Text | "Rajesh Kumar" | Owner's name |
| owner_phone | Text | "+919876543210" | Contact number with country code |
| preferred_booking_channel | Text | "whatsapp" | Options: whatsapp, call, both, online |

## Images (URLs or Google Drive Links)

| Field Name | Type | Example | Notes |
|------------|------|---------|-------|
| cover_image | Text | "https://drive.google.com/..." | Main cover photo |
| images | Array | ["url1", "url2", "url3"] | Multiple turf photos |
| signboard_image | Text | "https://drive.google.com/..." | Photo of turf name board |
| entry_parking_image | Text | "https://drive.google.com/..." | Entry and parking area photo |

## Additional

| Field Name | Type | Example | Notes |
|------------|------|---------|-------|
| unique_features | Text | "Indoor/outdoor hybrid turf with retractable roof" | Special features |
| external_review_url | Text | "https://maps.google.com/..." | Google Reviews link |

## How to Get Google Maps Data

### 1. Get Coordinates (lat, lng)
1. Open Google Maps
2. Search for the location
3. Right-click on the exact spot
4. Click on the coordinates (e.g., "19.955833, 73.790278")
5. They'll be copied to clipboard

### 2. Get Embed Link
1. Open Google Maps
2. Search for the location
3. Click "Share"
4. Click "Embed a map"
5. Copy the entire iframe code or just the URL from src=""

### 3. Get Plus Code
- The plus code (like "WRJ7+3M") is shown in Google Maps
- You can use this in the address field

## Sample Row for CSV

```csv
name,address,lat,lng,height_feet,length_feet,width_feet,start_time,end_time,price_per_hour,price_per_hour_weekend,number_of_grounds,equipment_provided,parking_available,net_condition,grass_condition,owner_name,owner_phone,preferred_booking_channel
"O2 FIELD","WRJ7+3M Deolali, Maharashtra",19.955833,73.790278,20,60,40,06:00:00,23:00:00,600,800,1,true,true,good,excellent,"Rajesh Kumar",+919876543210,whatsapp
```

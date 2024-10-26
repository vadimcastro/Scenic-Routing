from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import httpx
from dotenv import load_dotenv
import os
import asyncio
from math import sqrt, cos, pi, radians
from random import uniform, shuffle

# Load environment variables
load_dotenv()

# Get environment variables
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
PORT = int(os.getenv("PORT", 8000))
HOST = os.getenv("HOST", "0.0.0.0")

if not GOOGLE_MAPS_API_KEY:
    raise ValueError("GOOGLE_MAPS_API_KEY environment variable is not set")

# Initialize FastAPI app
app = FastAPI(title="Scenic Route Planner")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TourRequest(BaseModel):
    origin: str
    destination: str
    mode: str = "driving"
    scenic: bool = False
    eta_tolerance: int = 30
    waypoints: List[str] = []

def calculate_distance(start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> float:
    """Calculate the approximate distance between two points in meters."""
    lat_avg = radians((start_lat + end_lat) / 2)
    dx = (end_lng - start_lng) * cos(lat_avg) * 111320
    dy = (end_lat - start_lat) * 111320
    return sqrt(dx*dx + dy*dy)

ATTRACTION_CATEGORIES = [
    {
        "type": "water",
        "keywords": [
            "lake", "beach", "waterfront", "river view", "marina", "harbor",
            "waterfall", "bay view", "ocean view", "pond", "reservoir",
            "coastal view", "spring", "hot spring", "swimming hole",
            "water feature", "fountain", "lagoon", "cove", "inlet"
        ],
        "weight": 1.5
    },
    {
        "type": "landmark",
        "keywords": [
            "tourist attraction", "historic site", "landmark", "monument",
            "historic landmark", "historic district", "scenic overlook",
            "observation point", "national monument", "historic park",
            "historic building", "historic house", "historic bridge",
            "historic church", "castle", "lighthouse", "lookout tower",
            "vista point", "scenic spot", "overlook"
        ],
        "weight": 1.4
    },
    {
        "type": "nature",
        "keywords": [
            "state park", "national park", "scenic viewpoint", "garden",
            "nature preserve", "scenic trail", "nature center",
            "wildlife viewing", "botanical garden", "mountain view",
            "forest preserve", "canyon", "valley", "meadow", "prairie",
            "desert view", "rock formation", "cave", "natural wonder",
            "geological formation"
        ],
        "weight": 1.3
    },
    {
        "type": "cultural",
        "keywords": [
            "museum", "art gallery", "theater", "historical place",
            "cultural center", "heritage site", "art center",
            "performing arts", "science museum", "children's museum",
            "history museum", "cultural landmark", "archaeological site",
            "historic mansion", "historic mill", "historic fort"
        ],
        "weight": 1.2
    },
    {
        "type": "entertainment",
        "keywords": [
            "amusement park", "theme park", "water park", "zoo", "aquarium",
            "adventure park", "fun center", "miniature golf", "go karts",
            "observation wheel", "scenic railroad", "tourist railroad",
            "scenic drive", "scenic route", "parkway", "boardwalk"
        ],
        "weight": 1.1
    },
    {
        "type": "local",
        "keywords": [
            "local attraction", "town square", "main street", "historic downtown",
            "farmers market", "scenic restaurant", "viewpoint cafe",
            "scenic overlook restaurant", "historic inn", "scenic winery",
            "brewery with view", "scenic cafe", "rooftop restaurant",
            "scenic picnic area", "observation deck restaurant"
        ],
        "weight": 1.0
    }
]

async def get_place_details(client: httpx.AsyncClient, place_id: str) -> dict:
    """Fetch additional details for a place."""
    try:
        response = await client.get(
            "https://maps.googleapis.com/maps/api/place/details/json",
            params={
                "place_id": place_id,
                "fields": "formatted_address,photos,rating,user_ratings_total,editorial_summary,opening_hours,website,formatted_phone_number",
                "key": GOOGLE_MAPS_API_KEY
            },
            timeout=5.0
        )
        
        if response.status_code == 200:
            data = response.json()
            if data["status"] == "OK":
                return data["result"]
    except Exception as e:
        print(f"Error fetching place details: {str(e)}")
    return {}

async def find_scenic_points(client: httpx.AsyncClient, all_locations: List[dict], mode: str, eta_tolerance: int) -> List[dict]:
    """Simplified scenic point search with enhanced place details."""
    
    all_points = []
    start = all_locations[0]
    end = all_locations[-1]
    
    mid_lat = (float(start['lat']) + float(end['lat'])) / 2
    mid_lng = (float(start['lng']) + float(end['lng'])) / 2
    
    simple_categories = [
        {
            "type": "attraction",
            "keywords": ["tourist attraction", "landmark", "point of interest"],
            "weight": 1.0
        },
        {
            "type": "nature",
            "keywords": ["park", "lake", "scenic view"],
            "weight": 1.0
        }
    ]

    for category in simple_categories:
        for keyword in category["keywords"]:
            try:
                response = await client.get(
                    "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                    params={
                        "location": f"{mid_lat},{mid_lng}",
                        "radius": 50000,
                        "keyword": keyword,
                        "key": GOOGLE_MAPS_API_KEY
                    },
                    timeout=5.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data["status"] == "OK" and data["results"]:
                        for place in data["results"][:3]:
                            # Fetch additional details for the place
                            details = await get_place_details(client, place["place_id"])
                            
                            # Get photo reference if available
                            photo_reference = None
                            if "photos" in place and place["photos"]:
                                photo_reference = place["photos"][0]["photo_reference"]
                            
                            point_data = {
                                "location": f"{place['geometry']['location']['lat']},{place['geometry']['location']['lng']}",
                                "type": category["type"],
                                "name": place["name"],
                                "weight": category["weight"],
                                "place_id": place["place_id"],
                                "rating": place.get("rating"),
                                "user_ratings_total": place.get("user_ratings_total"),
                                "photo_reference": photo_reference,
                                "address": details.get("formatted_address"),
                                "description": details.get("editorial_summary", {}).get("overview"),
                                "website": details.get("website"),
                                "phone": details.get("formatted_phone_number"),
                                "opening_hours": details.get("opening_hours", {}).get("weekday_text", [])
                            }
                            all_points.append(point_data)
            
            except Exception as e:
                print(f"Error fetching points for {keyword}: {str(e)}")
                continue

    return all_points[:5]

@app.post("/api/tour")
async def create_tour(request: TourRequest):
    try:
        print(f"Processing tour request: {request.dict()}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get fastest route first
            fast_route_params = {
                "origin": request.origin,
                "destination": request.destination,
                "mode": request.mode,
                "key": GOOGLE_MAPS_API_KEY,
            }
            
            if request.waypoints:
                waypoints = [f"via:{point}" for point in request.waypoints]
                fast_route_params["waypoints"] = f"optimize:true|{('|').join(waypoints)}"
            
            fast_route_response = await client.get(
                "https://maps.googleapis.com/maps/api/directions/json",
                params=fast_route_params
            )
            
            fast_route_data = fast_route_response.json()
            if fast_route_data["status"] != "OK":
                raise HTTPException(status_code=400, detail=f"Could not find route: {fast_route_data['status']}")
            
            all_locations = [leg["start_location"] for leg in fast_route_data["routes"][0]["legs"]]
            all_locations.append(fast_route_data["routes"][0]["legs"][-1]["end_location"])
            
            fast_leg = fast_route_data["routes"][0]["legs"][0]
            base_duration = fast_leg["duration"]["value"]
            # Much more generous time allowance
            max_duration = base_duration * 2  # Allow up to double the time
            
            response_data = {
                "fastest_route": {
                    "distance": fast_leg["distance"]["text"],
                    "duration": fast_leg["duration"]["text"],
                    "steps": [
                        {
                            "instruction": step["html_instructions"],
                            "distance": step["distance"]["text"],
                            "duration": step["duration"]["text"]
                        }
                        for step in fast_leg["steps"]
                    ],
                    "polyline": fast_route_data["routes"][0]["overview_polyline"]["points"]
                }
            }
            
            if request.scenic:
                print("Searching for scenic route")
                
                scenic_points = await find_scenic_points(client, all_locations, request.mode, request.eta_tolerance)
                
                if scenic_points:
                    all_waypoints = [
                        *[f"via:{point}" for point in request.waypoints],
                        *[f"via:{point['location']}" for point in scenic_points]
                    ]
                    
                    scenic_route_params = fast_route_params.copy()
                    scenic_route_params["waypoints"] = f"optimize:true|{('|').join(all_waypoints)}"
                    
                    scenic_response = await client.get(
                        "https://maps.googleapis.com/maps/api/directions/json",
                        params=scenic_route_params
                    )
                    
                    if scenic_response.status_code == 200:
                        scenic_data = scenic_response.json()
                        
                        if scenic_data["status"] == "OK":
                            scenic_leg = scenic_data["routes"][0]["legs"][0]
                            scenic_duration = scenic_leg["duration"]["value"]
                            
                            if scenic_duration <= max_duration:
                                response_data["scenic_route"] = {
                                    "distance": scenic_leg["distance"]["text"],
                                    "duration": scenic_leg["duration"]["text"],
                                    "steps": [
                                        {
                                            "instruction": step["html_instructions"],
                                            "distance": step["distance"]["text"],
                                            "duration": step["duration"]["text"]
                                        }
                                        for step in scenic_leg["steps"]
                                    ],
                                    "polyline": scenic_data["routes"][0]["overview_polyline"]["points"],
                                    "scenic_points": scenic_points
                                }
                                print("Successfully added scenic route")
            
            return response_data
            
    except Exception as e:
        print(f"Error in create_tour: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print(f"Starting Scenic Route Planner server on http://{HOST}:{PORT}")
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
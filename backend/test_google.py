import os
import datetime
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

def get_google_service(access_token, refresh_token, service_name, version):
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=[
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/drive.metadata.readonly"
        ]
    )
    
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        
    return build(service_name, version, credentials=creds)

def fetch_morning_briefing_data(access_token, refresh_token):
    # 1. Fetch Calendar Events for Today
    calendar_service = get_google_service(access_token, refresh_token, 'calendar', 'v3')
    now = datetime.datetime.utcnow().isoformat() + 'Z'
    end_of_day = (datetime.datetime.utcnow() + datetime.timedelta(hours=24)).isoformat() + 'Z'
    
    events_result = calendar_service.events().list(
        calendarId='primary', timeMin=now, timeMax=end_of_day,
        singleEvents=True, orderBy='startTime'
    ).execute()
    events = events_result.get('items', [])

    # 2. Fetch Latest Unread Emails
    gmail_service = get_google_service(access_token, refresh_token, 'gmail', 'v1')
    messages_result = gmail_service.users().messages().list(
        userId='me', q='is:unread', maxResults=10
    ).execute()
    
    messages = []
    if 'messages' in messages_result:
        for msg in messages_result['messages']:
            m = gmail_service.users().messages().get(userId='me', id=msg['id']).execute()
            # Extract basic info
            headers = m['payload']['headers']
            subject = next(h['value'] for h in headers if h['name'] == 'Subject')
            sender = next(h['value'] for h in headers if h['name'] == 'From')
            messages.append({
                'id': msg['id'],
                'subject': subject,
                'from': sender,
                'snippet': m['snippet']
            })

    return {
        'events': events,
        'emails': messages
    }


if __name__ == '__main__':
    access_token = 'foo'
    refresh_token = 'bar'
    try:
        fetch_morning_briefing_data(access_token, refresh_token)
    except Exception as e:
        import traceback
        print('CRASH!')
        traceback.print_exc()

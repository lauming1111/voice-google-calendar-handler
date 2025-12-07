"""
Google Calendar automation agent using Playwright.
Operates Google Calendar via browser automation (no Google API keys required).
Keeps a persistent Playwright user profile so login state survives restarts.
"""

import asyncio
import os
import shutil
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import dateparser
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright


class GoogleCalendarAgent:
    def __init__(self) -> None:
        self.playwright: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.is_authenticated = False
        # Default to a local profile folder, but can be pointed to an existing Chrome profile via CHROME_USER_DATA_DIR
        self.user_data_dir = os.path.join(os.path.dirname(__file__), ".pw_profile")
        self.chrome_user_data_dir = os.environ.get("CHROME_USER_DATA_DIR")
        self.state_path = os.path.join(self.user_data_dir, "storage_state.json")
        self.cookies_path = os.environ.get("PLAYWRIGHT_COOKIES_FILE", os.path.join(self.user_data_dir, "cookies.json"))
        self.chrome_executable = os.environ.get(
            "CHROME_EXECUTABLE",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        )

    async def initialize(self, headless: bool = False, user_data_dir: Optional[str] = None) -> None:
        """
        Launch a persistent Chromium context and open Google Calendar.
        """
        if self.page:
            return

        print(f"[init] Starting initialization (headless={headless})")
        self.playwright = await async_playwright().start()

        if user_data_dir:
            self.user_data_dir = user_data_dir
        elif self.chrome_user_data_dir:
            self.user_data_dir = os.path.expanduser(self.chrome_user_data_dir)

        os.makedirs(self.user_data_dir, exist_ok=True)
        print(f"[init] User data dir: {self.user_data_dir}")

        async def _launch():
            if not self.chrome_executable or not os.path.exists(self.chrome_executable):
                raise RuntimeError(
                    f"CHROME_EXECUTABLE not found at: {self.chrome_executable}. "
                    "Set CHROME_EXECUTABLE to your installed Chrome binary."
                )
            launch_args = {
                "user_data_dir": self.user_data_dir,
                "headless": headless,
                "executable_path": self.chrome_executable,
                "args": ["--disable-blink-features=AutomationControlled","--start-maximized", "--disable-features=IsolateOrigins", "--disable-site-isolation-trials"],
            }

            print(f"[init] Browser launch args: {launch_args}")
            # Persistent context uses the provided user_data_dir (can point to your real Chrome profile)
            self.context = await self.playwright.chromium.launch_persistent_context(**launch_args)
            print(f"[init] Context created: {self.context}")
            return self.context

        try:
            print("[init] Launching browser...")
            self.context = await asyncio.wait_for(_launch(), timeout=15.0)
            
            # If external cookies were provided, inject them before navigation.
            if os.path.exists(self.cookies_path):
                try:
                    cookies = json.loads(Path(self.cookies_path).read_text())
                    if isinstance(cookies, dict) and "cookies" in cookies:
                        cookies = cookies["cookies"]
                    if isinstance(cookies, list):
                        await self.context.add_cookies(cookies)  # type: ignore[arg-type]
                        print(f"[init] Loaded {len(cookies)} cookies")
                except Exception as e:
                    print(f"[init] Cookie loading failed: {e}")
        except asyncio.TimeoutError:
            print("[init] Browser launch timed out (15s)")
            raise RuntimeError("Browser launch timeout")
        except Exception as e:
            print(f"[init] Browser launch error: {e}")
            # If the saved profile/state is corrupted, retry once with a fresh profile.
            await self._cleanup_playwright_only()
            shutil.rmtree(self.user_data_dir, ignore_errors=True)
            os.makedirs(self.user_data_dir, exist_ok=True)
            print("[init] Retrying with fresh profile...")
            self.playwright = await async_playwright().start()
            self.context = await asyncio.wait_for(_launch(), timeout=15.0)

        pages = self.context.pages
        self.page = pages[0] if pages else await self.context.new_page()
        print(f"[init] Page created/retrieved: {self.page}")

        print("[init] Navigating to Google Calendar...")
        try:
            await asyncio.wait_for(self.page.goto("https://calendar.google.com"), timeout=15.0)
        except asyncio.TimeoutError:
            print("[init] Navigation timeout (15s)")
        await asyncio.sleep(2)

        try:
            print("[init] Waiting for main calendar element...")
            await self.page.wait_for_selector('[role="main"]', timeout=7000)
            self.is_authenticated = True
            print("[init] Authenticated! Calendar main element found.")
            # Persist session for reuse across runs.
            try:
                await self.context.storage_state(path=self.state_path)
                print(f"[init] Saved storage state to {self.state_path}")
            except Exception:
                pass
        except Exception as e:
            print(f"[init] Not authenticated: {e}")
            self.is_authenticated = False

    async def close(self) -> None:
        """
        Cleanly close page/context/playwright.
        """
        try:
            if self.page:
                await self.page.close()
        except Exception:
            pass

        try:
            if self.context:
                await self.context.close()
        except Exception:
            pass
        try:
            if self.browser:
                await self.browser.close()
        except Exception:
            pass

        try:
            if self.playwright:
                await self.playwright.stop()
        except Exception:
            pass

        self.page = None
        self.context = None
        self.browser = None
        self.playwright = None

    async def _cleanup_playwright_only(self) -> None:
        try:
            if self.playwright:
                await self.playwright.stop()
        except Exception:
            pass
        self.playwright = None

    async def screenshot_bytes(self) -> Optional[bytes]:
        try:
            if not self.page:
                return None
            return await self.page.screenshot()
        except Exception:
            return None

    async def create_event(self, title: str, start_time, end_time=None, description: str = "") -> dict:
        """
        Create a calendar event by automating the UI.
        """
        if not self.page or not self.is_authenticated:
            return {"status": "error", "message": "Calendar not authenticated or initialized."}

        try:
            print("[playwright] Trying to open create dialog...")
            opened = False

            # Try localized role button
            try:
                await asyncio.wait_for(self.page.get_by_role("button", name="建立").first.click(), timeout=3.0)
                opened = True
                print("[playwright] Clicked role=button name='建立'")
            except Exception as e:
                print(f"[playwright] '建立' button not found/click failed: {e}")
                
            return {
                "status": "success",
                "message": f"Event '{title}' created successfully",
                "event": {
                    "title": title,
                    "start": self._format_datetime_for_input(start_time),
                    "end": self._format_datetime_for_input(end_time) if end_time else None,
                    "description": description,
                },
            }
        except Exception as e:
            return {"status": "error", "message": f"Failed to create event: {str(e)}"}

    async def get_today_events(self) -> dict:
        """
        Retrieve today's events from the calendar view.
        """
        if not self.page or not self.is_authenticated:
            return {"status": "error", "message": "Calendar not authenticated or initialized."}

        try:
            await self.page.wait_for_selector("[data-eventid]", timeout=5000)
            events = await self.page.evaluate(
                """
                () => {
                    const eventElements = document.querySelectorAll('[data-eventid]');
                    return Array.from(eventElements).map(el => ({
                        title: el.innerText,
                        id: el.getAttribute('data-eventid')
                    }));
                }
                """
            )
            return {"status": "success", "events": events, "count": len(events)}
        except Exception as e:
            return {"status": "error", "message": f"Failed to retrieve events: {str(e)}"}

    async def process_voice_command(self, command: str) -> dict:
        """
        Handle a natural-language command by mapping to calendar actions.
        """
        if not self.page or not self.is_authenticated:
            return {"status": "error", "message": "Calendar not initialized or not authenticated."}

        print(f"[voice] Received command: {command}")
        command_lower = command.lower()
        if "create" in command_lower or "add" in command_lower or "schedule" in command_lower or "日程" in command_lower:
            parsed = self._parse_command(command)
            if parsed.get("error"):
                print(f"[voice] Parse error: {parsed['error']}")
                return {"status": "error", "message": parsed["error"]}

            title = parsed["title"]
            start_time = parsed["start"]
            end_time = parsed["end"]

            print(f"[voice] Parsed title: {title}")
            print(f"[voice] Parsed time window: start={start_time}, end={end_time}")

            result = await self.create_event(title, start_time, end_time)
            print(f"[voice] Create event result: {result}")
            return result
        if "show" in command_lower or "view" in command_lower or "today" in command_lower:
            print("[voice] Fetching today events")
            return await self.get_today_events()
        print(f"[voice] Unsupported command: {command}")
        return {"status": "unsupported", "message": f"Command not recognized: {command}"}

    def _extract_title(self, command: str) -> str:
        import re

        match = re.search(
            r'(?:create|add|schedule)\s+(?:an?\s+)?event\s+(?:called\s+)?([^,]*?)(?:\s+(?:at|on|tomorrow|today))?',
            command,
            re.IGNORECASE,
        )
        if match:
            title = match.group(1).strip()
            if title:
                return title

        return "Untitled Event"

    def _extract_time(self, command: str) -> str:
        import re

        time_patterns = [
            r'(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))',
            r'(tomorrow)',
            r'(today)',
            r'(next\s+\w+day)',
        ]
        for pattern in time_patterns:
            match = re.search(pattern, command, re.IGNORECASE)
            if match:
                return match.group(1).strip()

        return "2:00 PM"

    def _extract_time_window(self, command: str) -> tuple[str, Optional[str]]:
        """
        Try to derive start and end times. Falls back to start-only strings.
        Handles simple English (tomorrow at 10am for 2 hours) and Chinese time windows.
        """
        import re

        # English style: tomorrow at 10am for 2 hours
        day_token = "tomorrow" if "tomorrow" in command.lower() else "today" if "today" in command.lower() else ""
        time_match = re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', command, re.IGNORECASE)
        duration_match = re.search(r'(\d+)\s*(hour|hours|hr|hrs)', command, re.IGNORECASE)

        if time_match:
            hour = int(time_match.group(1))
            minute = int(time_match.group(2) or 0)
            meridiem = time_match.group(3)
            if meridiem:
                mer = meridiem.lower()
                if mer == "pm" and hour < 12:
                    hour += 12
                if mer == "am" and hour == 12:
                    hour = 0
            # Build datetime
            base_date = datetime.now().date()
            if day_token == "tomorrow":
                base_date = base_date + timedelta(days=1)
            start_dt = datetime.combine(base_date, datetime.min.time()).replace(hour=hour, minute=minute)

            if duration_match:
                hours = int(duration_match.group(1))
                end_dt = start_dt + timedelta(hours=hours)
                return (start_dt.strftime("%Y-%m-%d %H:%M"), end_dt.strftime("%Y-%m-%d %H:%M"))

            return (start_dt.strftime("%Y-%m-%d %H:%M"), None)

        # Fallback to prior heuristic
        fallback = self._extract_time(command)
        return (fallback, None)

    def _parse_command(self, command: str) -> dict:
        """
        Attempt to extract intent slots (title, start, end) from a free-form command.
        Uses dateparser for robust date/time parsing.
        """
        base = datetime.now()
        text = command.strip()
        lower = text.lower()
        title = self._extract_title(command)

        # Prefer explicit window: "from 10am to 12pm", "10am-12pm"
        window_match = None
        for pattern in [
            r'\bfrom\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)\s+(?:to|-)\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)',
            r'\b([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)\s+(?:to|-)\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)',
        ]:
            window_match = re.search(pattern, lower, re.IGNORECASE)
            if window_match:
                break

        # Duration: "at 10am for 2 hours"
        time_phrase = None
        duration_hours = None
        single_time_match = re.search(r'\bat\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)', lower)
        duration_match = re.search(r'for\s+(\d+)\s*(hour|hours|hr|hrs)', lower)
        if single_time_match:
            time_phrase = single_time_match.group(1)
        if duration_match:
            duration_hours = int(duration_match.group(1))

        day_hint = "tomorrow" if "tomorrow" in lower else "today" if "today" in lower else ""

        def parse_dt(expr: str) -> Optional[datetime]:
            return dateparser.parse(expr, settings={"RELATIVE_BASE": base, "PREFER_DATES_FROM": "future"})

        start_dt: Optional[datetime] = None
        end_dt: Optional[datetime] = None

        if window_match:
            start_expr = window_match.group(1)
            end_expr = window_match.group(2)
            prefix = f"{day_hint} " if day_hint else ""
            start_dt = parse_dt(prefix + start_expr)
            end_dt = parse_dt(prefix + end_expr)
        elif time_phrase:
            prefix = f"{day_hint} " if day_hint else ""
            start_dt = parse_dt(prefix + time_phrase)
            if start_dt:
                if duration_hours:
                    end_dt = start_dt + timedelta(hours=duration_hours)

        # If still missing, fallback to previous heuristic
        if not start_dt:
            fallback_start, fallback_end = self._extract_time_window(command)
            start_dt = parse_dt(fallback_start) if fallback_start else None
            end_dt = parse_dt(fallback_end) if fallback_end else None

        if not start_dt:
            return {"error": "Could not determine start time from your command."}

        return {"title": title, "start": start_dt, "end": end_dt}

    def _format_datetime_for_input(self, value) -> str:
        """Format datetime or string to a form Google Calendar input accepts."""
        if value is None:
            return ""
        dt = value
        if isinstance(value, str):
            parsed = dateparser.parse(value, settings={"PREFER_DATES_FROM": "future"})
            if parsed:
                dt = parsed
        if isinstance(dt, datetime):
            return dt.strftime("%b %d, %Y %I:%M %p")
        return str(value)

    async def process_structured_command(self, payload: dict) -> dict:
        """
        Execute a structured payload from an upstream parser/agent.
        Expected keys: title, start, end (optional), description (optional).
        """
        if not self.page or not self.is_authenticated:
            return {"status": "error", "message": "Calendar not initialized or not authenticated."}

        title = payload.get("title") or "Untitled Event"
        start = payload.get("start")
        end = payload.get("end")
        description = payload.get("description", "")

        if not start:
            return {"status": "error", "message": "Missing required field: start"}

        print(f"[structured] title={title}, start={start}, end={end}, desc={description}")
        result = await self.create_event(title, start, end, description)
        print(f"[structured] create_event result: {result}")
        return result


_calendar_agent: Optional[GoogleCalendarAgent] = None


def get_calendar_agent() -> GoogleCalendarAgent:
    global _calendar_agent
    if _calendar_agent is None:
        _calendar_agent = GoogleCalendarAgent()
    return _calendar_agent


async def ensure_agent_ready(headless: bool = False, user_data_dir: Optional[str] = None) -> GoogleCalendarAgent:
    """
    Get the singleton agent and initialize it if needed.
    """
    agent = get_calendar_agent()
    needs_init = False
    if agent.page is None:
        needs_init = True
    else:
        try:
            if agent.page.is_closed():
                needs_init = True
        except Exception:
            needs_init = True

    if needs_init:
        await agent.initialize(headless=headless, user_data_dir=user_data_dir)
    return agent

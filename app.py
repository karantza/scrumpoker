""" Implements the server for a scrum-poker webapp. """
import typing
import queue
import json
import random
import string
import logging

from uuid import uuid4
from flask import Flask, abort, request, session, send_file, stream_with_context
from flask.wrappers import Response
from flask_cors import CORS, cross_origin
from datetime import datetime, timedelta

from wonderwords import RandomWord

app = Flask(__name__)
CORS(app)


app.secret_key = b"!\x9a\x89\x97L|\x8e\x105\t\xfd)\xdc<M\xbd"
app.static_folder = "static/static"

# No cacheing at all for API endpoints.
@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-transform, no-cache"
    response.headers["Content-Type"] = "text/event-stream"
    # response.headers["Connection"] = "keep-alive"

    return response


def event_str(event: str, data: dict):
    """Constructs the SSE string given the desired data."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


class MessageAnnouncer:
    """Implements a pub/sub queue to enable SSE endpoints."""

    listeners: list[queue.Queue[str]]

    def __init__(self):
        self.listeners = []

    def listen(self):
        """Returns a queue that will let you listen to new messages"""
        listener = queue.Queue[str](maxsize=5)
        self.listeners.append(listener)
        return listener

    def announce(self, event: str, data: dict):
        """Broadcasts an event to all listeners."""
        for i in reversed(range(len(self.listeners))):
            try:
                self.listeners[i].put_nowait(event_str(event, data))
            except queue.Full:
                del self.listeners[i]


class Vote(typing.TypedDict):
    """Represents the vote of a user."""

    value: float  # 0 means don't care
    star: bool  # do you have a strong feeling about it?


class RoomUserData(typing.TypedDict):
    """Represents a user's state in a room."""

    name: str
    current_vote: Vote | None
    open_streams: int
    last_ping: datetime


class RoomData(typing.TypedDict):
    """Represents a room."""

    user_data: dict[str, RoomUserData]
    revealed: bool  # are we in the state where we reveal votes?
    messages: MessageAnnouncer


# Maps room codes to room data
rooms: dict[str, RoomData] = {}

room_list_announcer = MessageAnnouncer()


def msg_for_room(room_id: str):
    """Gets the SSE notification for a room update"""
    room = get_room(room_id)
    return (
        "room",
        {"id": room_id, "users": [x["name"] for x in room["user_data"].values()]},
    )


def notify_room_updated(room_id: str):
    """Broadcast a room changed message to the index"""
    room_list_announcer.announce(*msg_for_room(room_id))


def random_name():

    r = RandomWord()
    starts_with = random.choice(string.ascii_lowercase)
    adj = r.word(
        starts_with=starts_with, include_parts_of_speech=["adjectives"]
    ).title()
    nou = r.word(starts_with=starts_with, include_parts_of_speech=["nouns"]).title()

    return f"{adj} {nou}"


def make_session():
    """Assigns us an id and name in the client session."""
    if "userid" not in session:
        session["userid"] = uuid4().hex
        session["name"] = random_name()


def get_room(room_id: str):
    """Returns the room or fails if it doesn't exist"""
    if room_id not in rooms:
        print("room not found")
        abort(400)
    return rooms[room_id]


def make_room(room_id: str):
    """Constructs a new room entry"""
    rooms[room_id] = {
        "messages": MessageAnnouncer(),
        "revealed": False,
        "user_data": {},
    }
    notify_room_updated(room_id)
    print(f"Made room {room_id}")


def join_room(room_id: str):
    """adds the current user to the room"""
    user_id = session["userid"]
    if user_id in rooms[room_id]["user_data"]:
        return  # already joined

    rooms[room_id]["user_data"][user_id] = {
        "name": session["name"],
        "current_vote": None,
        "open_streams": 0,
        "last_ping": datetime.now(),
    }
    rooms[room_id]["messages"].announce(
        "join", {"user": user_id, "name": session["name"]}
    )
    notify_room_updated(room_id)

    print(f"user {user_id} joined room {room_id}")


def leave_room(room_id: str, user_id: str):
    """removes the current user from the room"""
    rooms[room_id]["messages"].announce("part", {"user": user_id})
    del rooms[room_id]["user_data"][user_id]
    notify_room_updated(room_id)
    print(f"user {user_id} left room {room_id}")


def assert_in_room(room_id: str):
    """Abort if the user isn't in this room"""
    room = get_room(room_id)
    user_id = session.get("userid", None)

    if user_id not in room["user_data"]:
        print("user not in room")
        abort(400)


@app.route("/r/<string:room_id>/keepalive", methods=["POST"])
def post_keepalive(room_id: str):

    room = get_room(room_id)
    user_id = session["userid"]
    room["user_data"][user_id]["last_ping"] = datetime.now()

    return "ok", 200


@app.route("/r/<string:room_id>/stream", methods=["GET"])
def get_stream(room_id: str):
    """Event stream for things happening in the room"""
    make_session()

    if room_id not in rooms:
        make_room(room_id)

    join_room(room_id)

    room = get_room(room_id)
    user_id = session["userid"]
    username = session["name"]

    def stream():
        messages = room["messages"].listen()
        room["user_data"][user_id]["open_streams"] += 1
        print(
            f"user {user_id} {username} opens stream #"
            + str(room["user_data"][user_id]["open_streams"])
        )
        try:
            # on initial connect, send all user joins messages, sets votes, and sets mode.
            yield event_str("you", {"user": user_id})

            yield event_str("revealed", {"revealed": room["revealed"]})
            for userid, user in room["user_data"].items():
                yield event_str("join", {"user": userid, "name": user["name"]})
                yield event_str("vote", {"user": userid, "vote": user["current_vote"]})

            # This connection should forcibly disconnect after ~1 minute if it hasn't heard a ping.
            while datetime.now() < room["user_data"][user_id]["last_ping"] + timedelta(
                seconds=60
            ):
                try:
                    msg = messages.get(block=True, timeout=1)
                    yield msg
                except queue.Empty:
                    yield event_str("keepalive", {})

                lastping = datetime.now() - room["user_data"][user_id]["last_ping"]
                # print(f"Last ping for {username} was {lastping.total_seconds()}s ago")

        except GeneratorExit:
            print(f"user {user_id} {username} exited gracefully")
            pass

        finally:
            room["user_data"][user_id]["open_streams"] -= 1

            print(
                f"user {user_id} {username} closes stream, remaining: "
                + str(room["user_data"][user_id]["open_streams"])
            )

            if room["user_data"][user_id]["open_streams"] <= 0:
                # We were the last connection. Leave the room.
                leave_room(room_id, user_id)

    return Response(stream_with_context(stream()), mimetype="text/event-stream")


@app.route("/stream", methods=["GET"])
def get_all_rooms():
    """Stream for the index page"""
    make_session()

    def stream():
        try:
            messages = room_list_announcer.listen()
            # First send all the room info
            for room_id in rooms:
                yield event_str(*msg_for_room(room_id))

            # then stream updates
            while True:
                msg = messages.get(block=True)
                yield msg
        except:
            pass  # Any exception just exits the stream

    return Response(stream_with_context(stream()), mimetype="text/event-stream")


@app.route("/r/<string:room_id>/vote", methods=["POST"])
def post_vote(room_id: str):
    """Lets a user vote in a room"""
    assert_in_room(room_id)

    user_id = session["userid"]
    vote = request.json
    room = get_room(room_id)
    room["user_data"][user_id]["current_vote"] = vote

    room["messages"].announce("vote", {"user": user_id, "vote": vote})
    print(f"user {user_id} votes in room {room_id}: {vote}")

    return "ok", 200


@app.route("/r/<string:room_id>/reveal", methods=["POST"])
def post_reveal(room_id: str):
    """Reveals votes in a room"""
    assert_in_room(room_id)
    user_id = session["userid"]

    room = get_room(room_id)
    room["revealed"] = True

    room["messages"].announce("revealed", {"revealed": True})
    print(f"user {user_id} revealed room {room_id}")
    return "ok", 200


@app.route("/r/<string:room_id>/reset", methods=["POST"])
def post_reset(room_id: str):
    """Resets a room - conceals and resets votes"""
    assert_in_room(room_id)
    user_id = session["userid"]
    room = get_room(room_id)
    room["revealed"] = False
    for userid, user in room["user_data"].items():
        user["current_vote"] = None
        room["messages"].announce("vote", {"user": userid, "vote": None})

    room["messages"].announce("revealed", {"revealed": False})
    print(f"user {user_id} reset room {room_id}")
    return "ok", 200


@app.route("/name", methods=["POST", "GET"])
def name():
    """Get or set our name"""

    if "userid" not in session:
        abort(400, "Get a session first")
    user_id = session["userid"]

    if request.method == "POST":

        print(request.json)
        new_name = request.json["name"] if request.json else "Anonymous"

        print(f"user {user_id} changes name to {new_name}")

        session["name"] = new_name

        for room_id, room in rooms.items():
            if user_id in room["user_data"]:
                room["user_data"][user_id]["name"] = new_name
                room["messages"].announce("name", {"user": user_id, "name": new_name})
                notify_room_updated(room_id)

        return "ok", 200

    elif request.method == "GET":

        return json.dumps({"name": session["name"]}), 200

    else:
        abort(400)


@app.route("/", methods=["GET"])
def get_index_page():
    """Returns the main index page"""

    return send_file("static/index.html")


@app.route("/r/<string:room_id>", methods=["GET"])
def get_room_page(room_id: str):
    """Returns a specific room."""
    return send_file("static/index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9991, debug=False)

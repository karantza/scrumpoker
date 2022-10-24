import { produce } from "immer";
import React from "react";
import Confetti from "react-dom-confetti";
import { useParams } from "react-router-dom";
import ReconnectingEventSource from "reconnecting-eventsource";

import Header from "./Header";
import logo from "./ar-logo-color.png";
import useRobustStream from "./robustStream";

interface Vote {
  value: number;
  star: boolean;
}

interface RoomUserData {
  name: string;
  current_vote?: Vote;
}

interface RoomData {
  user_data: { [userid: string]: RoomUserData };
  revealed: boolean;
}

function Room() {
  let urlParams = useParams();
  const roomId = urlParams.roomId;

  const [myVote, setMyVote] = React.useState<Vote | null>(null);
  const [room, setRoom] = React.useState<RoomData>({
    user_data: {},
    revealed: false,
  });

  const setupStream = React.useCallback((sse: ReconnectingEventSource) => {
    
    // Stream events:
    // vote: user, vote
    // revealed: revealed
    // name: user, name
    // join: user, name
    // part: user
    // ping: ???

    sse.addEventListener("ping", async (e) => {
      const payload = JSON.parse(e.data);

      await fetch(`/r/${roomId}/keepalive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    });
    sse.addEventListener("join", (e) => {
      console.log(`got stream event 'join', data ${e.data}`);
      const { user, name } = JSON.parse(e.data) as {
        user: string;
        name: string;
      };

      setRoom(
        produce((room) => {
          room.user_data[user] = { name };
        })
      );
    });

    sse.addEventListener("part", (e) => {
      console.log(`got stream event 'part', data ${e.data}`);
      const { user } = JSON.parse(e.data) as { user: string };

      setRoom(
        produce((room) => {
          delete room.user_data[user];
        })
      );
    });

    sse.addEventListener("name", (e) => {
      console.log(`got stream event 'name', data ${e.data}`);
      const { user, name } = JSON.parse(e.data) as {
        user: string;
        name: string;
      };

      setRoom(
        produce((room) => {
          room.user_data[user].name = name;
        })
      );
    });

    sse.addEventListener("revealed", (e) => {
      console.log(`got stream event 'revealed', data ${e.data}`);
      const { revealed } = JSON.parse(e.data) as { revealed: boolean };

      if (!revealed) {
        setMyVote(null); // Reset local vote choice when the room is reset
      }

      setRoom(
        produce((room) => {
          room.revealed = revealed;
        })
      );
    });

    sse.addEventListener("vote", (e) => {
      console.log(`got stream event 'vote', data ${e.data}`);
      const { user, vote } = JSON.parse(e.data) as { user: string; vote: Vote };

      setRoom(
        produce((room) => {
          room.user_data[user].current_vote = vote;
        })
      );
    });

  }, [setRoom, roomId]);


  useRobustStream(`/r/${roomId}/stream`, setupStream)
  
  async function voteFor(value: number) {
    const vote: Vote = {
      value,
      star: false,
    };

    setMyVote(vote);

    await fetch(`/r/${roomId}/vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vote),
    });
  }

  async function setReveal(revealed: boolean) {
    await fetch(`/r/${roomId}/${revealed ? "reveal" : "reset"}`, {
      method: "POST",
    });
  }

  function textForValue(x: number | undefined) {
    if (x === 0) {
      return "?";
    } else if (x === undefined) {
      return "-";
    } else if (x === 11) {
      return ">10";
    } else if (x === 0.5) {
      return "½";
    }
    return x.toString();
  }

  const sortedUsers = Object.keys(room.user_data).sort((a, b) =>
    room.user_data[a].name.localeCompare(room.user_data[b].name)
  );

  const allVoted = Object.values(room.user_data).every(
    (x) => x.current_vote?.value !== undefined
  );

  const validVoteValues = Object.values(room.user_data)
    .map((x) => x.current_vote?.value || 0)
    .filter((x) => x > 0);
  const maxVote = Math.max(...validVoteValues);
  const minVote = Math.min(...validVoteValues);

  const confettiOn =
    room.revealed &&
    minVote === maxVote &&
    minVote > 0 &&
    validVoteValues.length > 1;

  const voteButton = (value: number) => {
    const style = { "--vote": value } as React.CSSProperties;
    return (
      <div
        className={`pointCard button ${
          room.revealed ? "disabled" : "enabled"
        } ${value === myVote?.value ? "selected" : "unselected"} ${
          value === 0 ? "zero" : value === 11 ? "max" : ""
        }`}
        style={style}
        key={`vote${value.toString().replace(".", "_")}`}
        onClick={() => {
          if (!room.revealed) voteFor(value);
        }}
      >
        {textForValue(value)}
      </div>
    );
  };

  return (
    <>
      <Header roomId={roomId} />

      <div className="main">
        <div className="pointContainer">
          {voteButton(0)}
          <div className="divider" />
          {voteButton(0.5)}
          {voteButton(1)}
          {voteButton(2)}
          {voteButton(3)}
          {voteButton(4)}
          {voteButton(5)}
          {voteButton(8)}
          {voteButton(10)}
          <div className="divider" />
          {voteButton(11)}
        </div>
        <div className="containers">
          {room.revealed ? (
            <button
              className="button secondary fullWidth"
              onClick={() => setReveal(false)}
            >
              Reset Room
            </button>
          ) : (
            <button
              className={`button fullWidth ${allVoted ? "primary" : ""}`}
              onClick={() => setReveal(true)}
            >
              Reveal Votes
            </button>
          )}
        </div>
        <div style={{ alignSelf: "center", width: 0, height: 0 }}>
          <Confetti
            active={confettiOn}
            config={{
              spread: 180,
              startVelocity: 30,
              elementCount: 200,
              stagger: 1,
            }}
          />
        </div>
        <div className="container secondary column">
          {sortedUsers.map((userid) => {
            const userValue = room.user_data[userid].current_vote?.value;
            return (
              <div
                className={`cardRow ${
                  minVote !== maxVote && room.revealed
                    ? userValue === minVote
                      ? "min"
                      : userValue === maxVote
                      ? "max"
                      : ""
                    : ""
                }`}
                key={userid}
              >
                <p>{room.user_data[userid].name}</p>

                <div
                  className={`pointCard ${
                    !room.revealed
                      ? userValue !== undefined
                        ? "played"
                        : "waiting"
                      : ""
                  } ${
                    room.revealed
                      ? (userValue === 0 || userValue === undefined)
                        ? "zero"
                        : userValue === 11
                        ? "max"
                        : ""
                      : ""
                  }`}
                  style={
                    {
                      "--vote": room.revealed ? userValue : 0,
                    } as React.CSSProperties
                  }
                >
                  {room.revealed ? textForValue(userValue) : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default Room;

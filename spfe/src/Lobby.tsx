import { produce } from "immer";
import React from "react";
import ReconnectingEventSource from 'reconnecting-eventsource'

import Header from "./Header";
import useRobustStream from "./robustStream";

type RoomList = {
  [id: string]: {
    users: string[];
  };
};

function Lobby() {
  const [rooms, setRooms] = React.useState<RoomList>({});
  
  const setupStream = React.useCallback((sse: ReconnectingEventSource) => {
  
    sse.addEventListener("room", (e) => {
      const room = JSON.parse(e.data);
      if (room.users.length === 0) {
        setRooms(
          produce((rooms) => {
            delete rooms[room.id];
          })
        );
      } else {
        setRooms(
          produce((rooms) => {
            rooms[room.id] = room;
          })
        );
      }
    });
  }, [setRooms]);

  useRobustStream(`/stream`, setupStream)

  function makeid() {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (var i = 0; i < 4; i++) {
      result += characters[Math.floor(Math.random() * characters.length)];
    }
    return result;
  }

  // Generate a room id each render that's guaranteed to not be in our list
  let randomRoomId = "";
  while (randomRoomId === "" || Object.keys(rooms).includes(randomRoomId))
    randomRoomId = makeid();

  return (<>
    <Header />

    <div className='main'>
      <a className='button primary fullWidth' 
      href={`/r/${randomRoomId}`}>New Room</a>
      
        {Object.keys(rooms).map((roomid) => (
          <div className='container secondary' key={roomid}>
            <a className='button secondary' href={`/r/${roomid}`}>Room {roomid}</a>
            <ul>
              {rooms[roomid].users.map((user) => (
                <li key={user}>{user}</li>
              ))}
            </ul>
          </div>
        ))}
    </div></>
  );
}

export default Lobby;

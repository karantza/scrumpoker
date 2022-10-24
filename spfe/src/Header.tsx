import React from "react";

interface Props {
  roomId?: string;
}
function Header(props: Props) {
  // Make a top bar that lets the user choose their name

  const [name, setName] = React.useState("");

  const fetchName = React.useCallback(async () => {
    fetch("/name")
      .then((resp) => resp.json())
      .then((data) => setName(data.name))
      .catch(() => setTimeout(fetchName, 50));
  }, [setName]);

  // on first load, we need to request our name from the server
  const loaded = React.useRef(false);
  React.useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      fetchName();
    }
  }, [name, setName]);

  const changeName = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const newName = evt.target.value;

    setName(newName);

    fetch("/name", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    });
  };

  return (
    <header className="header">
      <h1>
        <a id='title' href="/">Scrum Poker</a>
      </h1>
      {props.roomId && (
        <h2>
          <a href={`/r/${props.roomId}`}>Room {props.roomId}</a>
        </h2>
      )}

      <div className="nameInput">
        <label htmlFor="name_input">Your Name:&nbsp;</label>
        <input
          id="name_input"
          type="text"
          placeholder="Anonymous"
          onChange={changeName}
          value={name}
        />
      </div>
    </header>
  );
}

export default Header;

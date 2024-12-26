const socket = io();

let pseudo = "";
let isMyTurn = false;

function createShuffledDeck() {
    const suits = ["♥", "♦", "♣", "♠"];
    const values = [
        { rank: 1, label: "A" }, // Ace
        { rank: 2, label: "2" },
        { rank: 3, label: "3" },
        { rank: 4, label: "4" },
        { rank: 5, label: "5" },
        { rank: 6, label: "6" },
        { rank: 7, label: "7" },
        { rank: 8, label: "8" },
        { rank: 9, label: "9" },
        { rank: 10, label: "10" },
        { rank: 11, label: "J" }, // Jack
        { rank: 12, label: "Q" }, // Queen
        { rank: 13, label: "K" }  // King
    ];

    // Create the deck
    const deck = [];
    for (const suit of suits) {
        for (const value of values) {
            deck.push({ suit, rank: value.rank, label: value.label });
        }
    }

    // Shuffle the deck
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
}


function drawNewCard(deck) {
    if (deck.length === 0) {
        alert("The deck is empty! Restarting deck...");
        return createShuffledDeck().pop(); // Shuffle a new deck if the old one is empty
    }
    return deck.pop();
}


function startHigherLowerGame() {
    let deck = createShuffledDeck(); // Create and shuffle a deck
    let cards = deck.slice(0, 5); // Take the first 5 cards
    let currentIndex = 0;
    for (let index = 0; index < cards.length; index++) {
        deck.push(deck.shift());
    }
    console.log(deck);
    console.log(cards);

    function renderCards() {
        const cardsHtml = cards
            .map((card, index) => {
                const isCurrent = index === currentIndex;
                let color = 'blackcard';
                if (card.suit == '♥' || card.suit == '♦'){
                    color = 'redcard';
                }
                return `
                    <div class="card ${color} ${isCurrent ? "current" : ""}">
                        ${card.label} ${card.suit}
                    </div>
                `;
            })
            .join("");
        document.getElementById("currentCards").innerHTML = cardsHtml;
    }
    
    

    // Initialize the Higher or Lower UI
    const higherLowerDiv = document.getElementById("higherLowerGame");
    higherLowerDiv.innerHTML = `
        <h2>Higher or Lower</h2>
        <div id="currentCards" class="cards-container"></div>
        <button id="higher">Higher</button>
        <button id="lower">Lower</button>
        <p id="higherLowerMessage"></p>
    `;

    renderCards(); // Render the initial set of cards

    // Add button event listeners
    document.getElementById("higher").addEventListener("click", () => handleHigherLower("higher"));
    document.getElementById("lower").addEventListener("click", () => handleHigherLower("lower"));

    function handleHigherLower(choice) {
        const currentCard = cards[currentIndex];
        const nextCard = cards[currentIndex + 1];

        //console.log(`Current Card is: ${formatCard(currentCard)} and next card is: ${formatCard(nextCard)}`);
    
        if (!nextCard) {
            document.getElementById("higherLowerMessage").textContent = "You completed the game!";
            socket.emit("higherLowerComplete");
            return;
        }
    
        const isCorrect =
            (choice === "higher" && deck[0].rank >= currentCard.rank) ||
            (choice === "lower" && deck[0].rank <= currentCard.rank);
    
        if (isCorrect) {
            document.getElementById("higherLowerMessage").textContent = "Correct! Moving to the next card.";
    
            // Replace the guessed card with a new card from the deck
            replaceCard(currentIndex, deck.shift());
            currentIndex++;
            renderCards(); // Update display
        } else {
            document.getElementById("higherLowerMessage").textContent = "You failed! Replacing the guessed card.";
    
            // Replace the guessed card with a new card from the deck
            replaceCard(currentIndex, deck.shift());
            currentIndex = 0; // Reset sequence to the beginning
            renderCards();
        }
    
        // Return the old card to the deck and reshuffle
        //reshuffleDeck();
    
        // Check if the deck is exhausted
        if (deck.length <= 0) {
            reshuffleDeck();
        }
    }
    function replaceCard(index, newCard) {
        const oldCard = cards[index];
        cards[index] = newCard; // Replace the card in the current cards
        deck.push(oldCard); // Return the old card to the deck
        //console.log(`Replaced card at index ${index} with ${formatCard(newCard)}. Old card ${formatCard(oldCard)} returned to deck.`);
    }
    
    
    
    

    function reshuffleDeck() {
        console.log("Reshuffling the deck...");
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        console.log("Deck reshuffled:", deck);
    }
    
    
}







document.getElementById("setPseudo").addEventListener("click", () => {
    pseudo = document.getElementById("pseudo").value.trim();

    if (pseudo) {
        socket.emit("setPseudo", pseudo);
    } else {
        alert("Please enter a valid pseudo!");
    }
});


document.getElementById("createLobby").addEventListener("click", () => {
    socket.emit("createLobby");
});

let isHost = false;

// Handle lobby creation
socket.on("lobbyCreated", ({ roomKey, host }) => {
    document.getElementById("lobbyInfo").textContent = `Lobby key: ${roomKey}`;
    document.getElementById("game").style.display = "block";
    document.getElementById("lobby").style.display = "none";

    isHost = socket.id === host; // Check if this player is the host
    if (!isHost) {
        document.getElementById("startGame").style.display = "none"; // Hide the button for non-hosts
    }
});

// Handle successful join
socket.on("joinSuccess", ({ players, host }) => {
    const playerList = Object.values(players)
        .map((p) => `<p>${p.pseudo}</p>`)
        .join("");
    document.getElementById("playerList").innerHTML = `<h3>Players:</h3>${playerList}`;
    document.getElementById("game").style.display = "block";
    document.getElementById("lobby").style.display = "none";

    isHost = socket.id === host; // Check if this player is the host
    if (!isHost) {
        document.getElementById("startGame").style.display = "none"; // Hide the button for non-hosts
    }
});


document.getElementById("joinLobby").addEventListener("click", () => {
    const joinKey = document.getElementById("joinKey").value.trim();

    if (!joinKey) {
        alert("Please enter a valid lobby key!");
        return;
    }

    socket.emit("joinLobby", joinKey);
});



socket.on("playerJoined", (players) => {
    const playerList = Object.values(players).map((p) => `<p>${p.pseudo}</p>`).join("");
    document.getElementById("playerList").innerHTML = `<h3>Players:</h3>${playerList}`;
    document.getElementById("game").style.display = "block";
    document.getElementById("lobby").style.display = "none";
});

document.getElementById("startGame").addEventListener("click", () => {
    socket.emit("startGame");
});


document.getElementById("hand").addEventListener("click", (e) => {
    if (!isMyTurn) {
        alert("It's not your turn!");
        return;
    }

    if (e.target.classList.contains("card")) {
        const [value, suit] = e.target.textContent.split(" ");
        const card = { value: isNaN(value) ? value : Number(value), suit };

        console.log("Playing card:", card); // Debugging log
        socket.emit("playCard", card);
    }
});


socket.on("gameStarted", (players) => {
    // Hide the "Start Game" button
    document.getElementById("startGame").style.display = "none";
    document.getElementById("playerList").style.display = "none";
    document.getElementById("header").style.display = "none";

    const currentPlayer = players[socket.id];
    if (currentPlayer) {
        const hand = currentPlayer.hand.map(
            (card) =>{
                let color = 'blackcard';
                if (card.suit == '♥' || card.suit == '♦'){
                    color = 'redcard';
                }
                return `<button class="card ${color}">${card.value} ${card.suit}</button>`;
            }).join("");
        document.getElementById("hand").innerHTML = hand;
    }

    document.getElementById("gameActions").style.display = "block";
});


socket.on("yourTurn", (total) => {
    isMyTurn = true;
    //document.getElementById("currentTotal").textContent = `Total: ${total}`;

    const gameActionsDiv = document.getElementById("gameActions");
    gameActionsDiv.style.backgroundColor = "green";

    document.getElementById("waitingPlayer").textContent = "It's your turn!";
    document.getElementById("waitingPlayer").classList.add("active");
});

socket.on("updateTurn", (currentPlayer) => {
    document.getElementById("waitingPlayer").textContent = `Waiting for: ${currentPlayer}`;
    document.getElementById("waitingPlayer").classList.remove("active");
});

socket.on("cardPlayed", ({ player, card, total, newCard, specialEffect }) => {
    //document.getElementById("currentTotal").textContent = `Total: ${total}`;


    // Remove the played card from the player's hand in the UI
    if (player === pseudo) {
        const handElement = document.getElementById("hand");
        const cardButton = Array.from(handElement.children).find(
            (btn) => btn.textContent === `${card.value} ${card.suit}`
        );
        if (cardButton) {
            cardButton.remove();
        }
    }

    let color = 'blackcard';
    if (card.suit == '♥' || card.suit == '♦'){
        color = 'redcard';
    }
    document.getElementById("lastCardPlayed").innerHTML = `${card.value} ${card.suit}`;
    document.getElementById("lastCardPlayed").classList += color;


    // It's no longer your turn, so change background to gray
    isMyTurn = false;
    const gameActionsDiv = document.getElementById("gameActions");
    gameActionsDiv.style.backgroundColor = "gray";

    // Add the new card to the player's hand if they drew one
    if (newCard && newCard.pseudo === pseudo) {
        const newCardElement = document.createElement("button");
        newCardElement.className = "card";
        newCardElement.textContent = `${newCard.card.value} ${newCard.card.suit}`;
        document.getElementById("hand").appendChild(newCardElement);
    }
});

// Handle pseudo success
socket.on("pseudoSuccess", (validatedPseudo) => {
    const setPseudoButton = document.getElementById("setPseudo");
    setPseudoButton.textContent = "Pseudo Set";
    setPseudoButton.classList.add("validated");
    pseudo = validatedPseudo;
});

// Handle pseudo error
socket.on("pseudoError", (errorMessage) => {
    alert(errorMessage);
});






// Show the "Restart Game" button for the host
socket.on("gameOver", ({ loser }) => {
    console.log(`Game Over. Loser: ${loser}`); // Debug: Log the loser

    if (isHost) {
        console.log("Showing Restart Game button to the host."); // Debug: Confirm button visibility
        document.getElementById("restartGame").style.display = "block";
    }
});

// Handle the "Restart Game" button click
document.getElementById("restartGame").addEventListener("click", () => {
    console.log("Restart Game button clicked."); // Debug: Log button click
    socket.emit("restartGame");
});

// Handle the game restarted event
socket.on("gameRestarted", ({ players, total, currentTurn }) => {

    console.log("Game restarted:", { players, total, currentTurn }); // Debug: Log restart data
    console.log("Your hand after restart:", players[socket.id].hand); // Debug: Log player's hand
    console.log("Restarted total:", total); // Debug: Log reset total
    
    document.getElementById("restartGame").style.display = "none"; // Hide the restart button

    // Reset the player's hand and the UI
    const currentPlayer = players[socket.id];
    if (currentPlayer) {
        const hand = currentPlayer.hand.map(
            (card) => `<button class="card">${card.value} ${card.suit}</button>`
        ).join("");
        document.getElementById("hand").innerHTML = hand;
    }

    //document.getElementById("currentTotal").textContent = `Total: ${total}`;


    // Highlight the turn for the current player
    if (socket.id === currentTurn) {
        isMyTurn = true;
        document.getElementById("gameActions").style.backgroundColor = "green";
        document.getElementById("turnInfo").textContent = "It's your turn!";
    } else {
        isMyTurn = false;
        document.getElementById("gameActions").style.backgroundColor = "gray";
    }
});

socket.on("startHigherLower", () => {
    document.getElementById("game").style.display = "none"; // Hide the main game
    document.getElementById("higherLowerGame").style.display = "block"; // Show Higher or Lower

    // Initialize the Higher or Lower game
    startHigherLowerGame();
});


socket.on("higherLowerComplete", ({ player }) => {
    if (socket.id === player) {
        // Reset the Higher or Lower game UI
        document.getElementById("higherLowerGame").style.display = "none";

        // Bring back the 99 game UI, but disable actions for this player
        document.getElementById("game").style.display = "block";
        document.getElementById("turnInfo").textContent = "You are now a spectator in the 99 game.";
        document.getElementById("gameActions").style.display = "none"; // Hide the action buttons
    } else {
        // Notify other players that the mini-game is complete
        document.getElementById("turnInfo").textContent = "The Higher or Lower game is complete!";
    }
});

socket.on("error", (message) => {
    alert(message); // Display an alert for any errors
});
socket.on("showRestartButton", () => {
    document.getElementById("restartGame").style.display = "block";
});




const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // Store room data

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Helper functions
const createDeck = () => {
    const suits = ["♥", "♦", "♣", "♠"];
    const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A"];
    const deck = [];
    suits.forEach((suit) => {
        values.forEach((value) => {
            deck.push({ suit, value });
        });
    });
    return deck;
};

const shuffleDeck = (deck) => {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
};

const getNextPlayerWithCards = (room) => {
    const maxPlayers = room.turnOrder.length;
    let nextTurn = (room.currentTurn + 1) % maxPlayers;

    while (nextTurn !== room.currentTurn) {
        const nextPlayerId = room.turnOrder[nextTurn];
        if (room.players[nextPlayerId].hand.length > 0) {
            return nextTurn; // Found a player with cards
        }
        nextTurn = (nextTurn + 1) % maxPlayers;
    }

    return -1; // No players with cards
};



const dealCards = (deck, count) => deck.splice(0, count);

const calculateNewTotal = (total, card, isDeckEmpty) => {
    const value = card.value;

    // Special logic when the deck is empty
    if (isDeckEmpty) {
        if (value === "Q" || value === "K") {
            return total + 1; // Queen and King are worth 1 point when the deck is empty
        }
        if (value === "J") {
            return total; // Jack remains 0
        }
    }

    // Default logic for a full deck
    if (typeof value === "number") {
        return total + value;
    }

    switch (value) {
        case "Q": return total - 10; // Queen subtracts 10
        case "K": return 70; // King sets the total to 70
        case "J": return total; // Jack is 0
        case "A": return total + 1; // Ace adds 1
        default: return total;
    }
};

function updateTurn(roomKey) {
    const room = rooms[roomKey];
    const currentPlayerId = room.turnOrder[room.currentTurn];
    const currentPlayer = room.players[currentPlayerId];

    // Notify all players about the current turn
    io.to(roomKey).emit("updateTurn", currentPlayer.pseudo);

    // Notify the current player that it's their turn
    io.to(currentPlayerId).emit("yourTurn", room.total);
}


// Socket.IO logic
io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Set player pseudo
    socket.on("setPseudo", (pseudo) => {
        // Check if the pseudo is already taken
        const isPseudoTaken = Object.values(rooms).some((room) =>
            Object.values(room.players).some((player) => player.pseudo === pseudo)
        );
    
        if (isPseudoTaken) {
            socket.emit("pseudoError", "This pseudo is already taken. Please choose another one.");
            return;
        }
    
        // Set the pseudo for the player
        socket.pseudo = pseudo || "Anonymous";
        console.log(`Player ${socket.id} set pseudo to: ${pseudo}`);
        socket.emit("pseudoSuccess", pseudo);
    });
    

    socket.on("createLobby", () => {
        const roomKey = Math.random().toString(36).substr(2, 6).toUpperCase();
        rooms[roomKey] = {
            players: {},
            turnOrder: [],
            currentTurn: 0,
            total: 0,
            gameActive: false,
            host: socket.id, // Mark this player as the host
            rules: {
                joker_1: false,
                joker_2: false,
                sablier: false,
                autoroute: 5,
                echanges: false,
                cards: 3,
                piochePose: false,
                tokens: false
            }
        };
    
        rooms[roomKey].players[socket.id] = {
            pseudo: socket.pseudo || "Host",
            hand: [],
        };
        rooms[roomKey].turnOrder.push(socket.id);
    
        socket.roomKey = roomKey;
        socket.join(roomKey);
    
        // Send lobby created response with host ID
        socket.emit("lobbyCreated", { roomKey, host: socket.id });
        io.to(roomKey).emit("playerJoined", rooms[roomKey].players);
    });
    
    socket.on("joinLobby", (roomKey) => {
        const room = rooms[roomKey];
    
        if (!room) {
            socket.emit("error", "Lobby does not exist.");
            return;
        }
    
        const isPseudoTaken = Object.values(room.players).some((player) => player.pseudo === socket.pseudo);
    
        if (isPseudoTaken) {
            socket.emit("pseudoError", "This pseudo is already used in the lobby. Please choose another one.");
            return;
        }
    
        room.players[socket.id] = {
            pseudo: socket.pseudo || "Anonymous",
            hand: [],
            canPlay: false,
        };
        room.turnOrder.push(socket.id);
    
        socket.roomKey = roomKey;
        socket.join(roomKey);
    
        // Send join success with host ID
        socket.emit("joinSuccess", { players: room.players, host: room.host });
        io.to(roomKey).emit("playerJoined", room.players);
    });
    
    

    // Start the game
    socket.on("startGame", () => {
        const roomKey = socket.roomKey;
        const room = rooms[roomKey];
    
        if (!room || room.host !== socket.id || room.gameActive) {
            socket.emit("error", "Unable to start game.");
            return;
        }
    
        // Create and shuffle the deck
        const deck = createDeck();
        shuffleDeck(deck);
        room.deck = deck;
    
        // Deal 3 cards to each player
        for (const playerId in room.players) {
            room.players[playerId].hand = dealCards(deck, 3);
            room.players[playerId].canPlay = true;
        }
    
        room.gameActive = true;
    
        io.to(roomKey).emit("gameStarted", room.players);
        io.to(room.turnOrder[room.currentTurn]).emit("yourTurn", room.total);
        updateTurn(roomKey);
    });
    
    
    
    // Handle playing a card
    socket.on("playCard", (card) => {
        const roomKey = socket.roomKey;
        const room = rooms[roomKey];
    
        if (!room || room.turnOrder[room.currentTurn] !== socket.id) {
            socket.emit("error", "It's not your turn!");
            return;
        }
    
        const player = room.players[socket.id];

        // Check if the player is allowed to play
        if (!player.canPlay) {
            socket.emit("error", "You cannot play in the current game.");
            return;
        }
        const cardIndex = player.hand.findIndex(
            (c) => c.suit === card.suit && c.value === card.value
        );
    
        if (cardIndex === -1) {
            socket.emit("error", "You do not have this card.");
            return;
        }
    
        // Remove the card from the player's hand
        player.hand.splice(cardIndex, 1);
    
        const isDeckEmpty = room.deck.length === 0;
    
        // Handle special logic for Jack
        if (card.value === "J") {
            room.turnOrder.reverse();
    
            // Recalculate currentTurn to point to the same player in the reversed order
            room.currentTurn = (room.turnOrder.length - room.currentTurn - 1) % room.turnOrder.length;
    
            // Draw a new card if the deck is not empty
            let newCard = null;
            if (room.deck.length > 0) {
                newCard = room.deck.pop();
                player.hand.push(newCard);
            }
    
            io.to(roomKey).emit("cardPlayed", {
                player: player.pseudo,
                card,
                total: room.total, // The total remains unchanged
                newCard: newCard ? { pseudo: player.pseudo, card: newCard } : null,
                specialEffect: "Jack reversed the turn order!",
            });
    
            // Find the next player with cards
            const nextTurn = getNextPlayerWithCards(room);
            if (nextTurn === -1) {
                io.to(roomKey).emit("gameOver", { loser: "No one! All players are out of cards!" });
                room.gameActive = false;
                return;
            }
    
            room.currentTurn = nextTurn;
            const nextPlayerId = room.turnOrder[room.currentTurn];
            io.to(nextPlayerId).emit("yourTurn", room.total);
            return;
        }
    
        // Calculate the new total based on the card value and empty deck rules
        const newTotal = calculateNewTotal(room.total, card, isDeckEmpty);
    
        if (newTotal > 94) {
            const loser = player.pseudo;
        
            // Notify all players of the game over
            io.to(roomKey).emit("gameOver", { loser });
        
            // Set the losing player's `canPlay` to false
            room.players[socket.id].canPlay = false;
        
            // Start the Higher or Lower game for the losing player
            io.to(socket.id).emit("startHigherLower");
            return;
        }
    
        room.total = newTotal;
    
        // Draw a new card if the deck is not empty
        let newCard = null;
        if (room.deck.length > 0) {
            newCard = room.deck.pop();
            player.hand.push(newCard);
        }
    
        io.to(roomKey).emit("cardPlayed", {
            player: player.pseudo,
            card,
            total: room.total,
            newCard: newCard ? { pseudo: player.pseudo, card: newCard } : null,
        });
    
        // Find the next player with cards
        const nextTurn = getNextPlayerWithCards(room);
        if (nextTurn === -1) {
            io.to(roomKey).emit("gameOver", { loser: "No one! All players are out of cards!" });
            room.gameActive = false;
            room.players[socket.id].canPlay = false;
            return;
        }
    
        room.currentTurn = nextTurn;
        updateTurn(roomKey);
        const nextPlayerId = room.turnOrder[room.currentTurn];
        io.to(nextPlayerId).emit("yourTurn", room.total);
    });
    
    
    
    
    socket.on("restartGame", () => {
        const roomKey = socket.roomKey;
        const room = rooms[roomKey];
    
        if (!room || room.host !== socket.id) {
            socket.emit("error", "Only the host can restart the game.");
            return;
        }
    
        // Reset game state
        const deck = createDeck();
        shuffleDeck(deck);
    
        room.total = 0; // Reset the total to 0
        room.currentTurn = 0; // Reset to the first player
        room.gameActive = true; // Indicate the game is active
    
        // Deal new cards to all players
        for (const playerId in room.players) {
            room.players[playerId].hand = dealCards(deck, 3);
            room.players[playerId].canPlay = true;
        }
    
        console.log("Players and hands:", room.players); // Debug: Check player hands
        console.log("Turn order:", room.turnOrder); // Debug: Check turn order
        console.log("Current total:", room.total); // Debug: Check reset total

        room.deck = deck; // Assign the new deck
    
        // Notify all players that the game has restarted
        io.to(roomKey).emit("gameRestarted", {
            players: room.players,
            total: room.total,
            currentTurn: room.turnOrder[room.currentTurn],
        });
    
        // Notify the first player that it’s their turn
        const nextPlayerId = room.turnOrder[room.currentTurn];
        io.to(nextPlayerId).emit("yourTurn", room.total);
    });
    
    socket.on("higherLowerComplete", () => {
        const roomKey = socket.roomKey;
        const room = rooms[roomKey];
    
        if (!room) {
            socket.emit("error", "No active room found.");
            return;
        }
    
        // Notify all players that the mini-game is complete
        io.to(roomKey).emit("higherLowerComplete", { player: socket.id });
    
        // Do not reset `canPlay` for the losing player, keeping them as a spectator
        console.log(`Player ${socket.id} completed the Higher or Lower game.`);
    });
    
    
    

    // Handle disconnection
    socket.on("disconnect", () => {
        const roomKey = socket.roomKey;
        if (roomKey && rooms[roomKey]) {
            const room = rooms[roomKey];
            delete room.players[socket.id];
            room.turnOrder = room.turnOrder.filter((id) => id !== socket.id);

            if (Object.keys(room.players).length === 0) {
                delete rooms[roomKey];
            } else {
                io.to(roomKey).emit("playerJoined", room.players);
            }
        }
    });
});


// Start server
server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});

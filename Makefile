.ONESHELL:
build-local:
	cd ./backend
	./scripts/build.sh
	cd ../frontend
	NEXT_PUBLIC_API_URL="http://localhost:8000" ./scripts/build.sh

run: build-local
	docker stop watch2play-frontend
	docker stop watch2play-backend
	./backend/scripts/start.sh
	./frontend/scripts/start.sh
	docker logs -f watch2play-backend

build:
	cd ./backend
	./scripts/build.sh
	cd ../frontend
	NEXT_PUBLIC_API_URL="https://api.minecrafthosting.gg" ./scripts/build.sh

deploy: build
	docker tag watch2play-frontend 192.168.2.203:5000/watch2play-frontend:latest
	docker tag watch2play-backend 192.168.2.203:5000/watch2play-backend:latest
	docker push 192.168.2.203:5000/watch2play-frontend:latest
	docker push 192.168.2.203:5000/watch2play-backend:latest
	kubectl rollout restart deployment/watch2play-frontend -n watch2play
	kubectl rollout restart deployment/watch2play-backend -n watch2play

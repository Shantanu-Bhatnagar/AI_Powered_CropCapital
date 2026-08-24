import torchvision.datasets as datasets
import torchvision.transforms as transforms 
import torch 
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import random_split, DataLoader 
from torchvision import models

transform = transforms.Compose([
    transforms.Resize((64,64)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485,0.456,0.406], std=[0.229 , 0.224, 0.225])
])

dataset = datasets.EuroSAT(root='./Dataset', download=True, transform = transform)
train_loader = DataLoader(dataset, batch_size=32, shuffle=True)


#Splitting data into training and validation sets
train_size = int(0.8*len(dataset))
val_size =  len(dataset) - train_size
train_dataset, val_dataset = random_split(dataset, [train_size, val_size])

train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=32, shuffle=False)


# Loading a pre-trained ResNet18 model and modifying the final layer for 10 classes
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
num_features = model.fc.in_features
model.fc = nn.Linear(num_features, 10)
model =  model.to(device)

# defining loss function and optimizer
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=1e-4)

# Executing the training and validation loop
epochs = 5 
for epoch in range(epochs):
    model.train()
    train_loss, train_correct = 0.0, 0

    for images, labels in train_loader:
        images, labels = images.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        train_loss += loss.item() * images.size(0)
        _, pred = torch.max(outputs, 1)
        train_correct += torch.sum(pred == labels.data)

    train_acc = train_correct.double() / len(train_dataset)

    #validation phase
    model.eval()
    val_correct =0
    with torch.no_grad():
        for images, labels in val_loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            _, preds = torch.max(outputs, 1)
            val_correct += torch.sum(preds == labels.data)

    val_acc = val_correct.double() /len(val_dataset)
    print(f"Epoch {epoch+1}/{epochs} | Train Acc: {train_acc:.4f} | Val Acc: {val_acc:.4f}")


torch.save(model.state_dict(), "eurosat_resnet18.pth")